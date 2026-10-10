import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { decodeReportRecord, encodeGetReport, encodeRegisterReport, REPORT_REGISTRY_CREATION_BYTECODE, REPORT_REGISTRY_VERSION } from '@/lib/report-registry';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ArrowDownLeft, ArrowRight, Blocks, Check, ChevronRight, Copy, FileCheck2, Fingerprint, FlaskConical, Gauge, LayoutDashboard, LoaderCircle, RefreshCw, Search, ShieldCheck, Wallet } from 'lucide-react';

const queryClient = new QueryClient();
const RPC = 'https://testnet-rpc.monad.xyz';
const CHAIN_ID = 10143;
const SOFTWARE_VERSION = '0.1.0';

type RpcStatus = { loading: boolean; error: string; chainId: number | null; blockNumber: string | null; blockTimestamp: number | null; checkedAt: number | null };
type Receipt = { transactionHash: string; status?: string; blockNumber?: string; gasUsed?: string; effectiveGasPrice?: string; from?: string; to?: string; contractAddress?: string | null };
type TransactionInfo = { hash: string; from?: string; to?: string | null; gas?: string; blockNumber?: string | null };
type BenchRun = { scenario: string; txHash: string; success: boolean | null; gasUsed: string | null; timestamp: string; blockTimestamp?: string; blockNumber?: string; target?: string; calldata?: string; payloadHash?: string };
type WalletProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (event: string, cb: (...args: unknown[]) => void) => void; removeListener?: (event: string, cb: (...args: unknown[]) => void) => void };
declare global { interface Window { ethereum?: WalletProvider } }

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) });
  if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}`);
  const body = await response.json() as { result?: T; error?: { message?: string; code?: number } };
  if (body.error) throw new Error(body.error.message || `RPC error ${body.error.code ?? ''}`);
  return body.result as T;
}
function short(value?: string | null, left = 10, right = 8) { if (!value) return '—'; return value.length > left + right + 3 ? `${value.slice(0, left)}…${value.slice(-right)}` : value; }
function validHash(value?: string | null): value is string { return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value.trim()); }
function validAddress(value?: string | null): value is string { return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value.trim()); }
function weiToEth(value?: string) {
  if (!value) return null;
  try {
    const wei = BigInt(value);
    const unit = 10n ** 18n;
    const whole = (wei / unit).toString();
    const fraction = (wei % unit).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
    return `${whole}${fraction ? `.${fraction}` : ''} MON`;
  } catch { return null; }
}
function hexInt(value?: string) { if (!value) return null; try { return Number(BigInt(value)); } catch { return null; } }
function formatDate(value?: string | number | null) { if (value === undefined || value === null || value === '') return '—'; const d = typeof value === 'number' ? new Date(value) : new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }); }
function stableJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Report data contains a non-JSON value.');
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  throw new Error('Report data contains a value that cannot be serialized.');
}
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `0x${Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
async function waitForReceipt(hash: string, attempts = 30, delayMs = 2000): Promise<Receipt | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const receipt = await rpc<Receipt | null>('eth_getTransactionReceipt', [hash]);
      if (receipt) return receipt;
    } catch {
      // A temporary read failure does not determine transaction outcome.
    }
    await new Promise(resolve => window.setTimeout(resolve, delayMs));
  }
  return null;
}
const TESTNET_EXPLORER = 'https://testnet.monadvision.com';
function LogoMark({ className = '' }: { className?: string }) { return <svg className={`aperture ${className}`} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 2.8 27.4 9.4v13.2L16 29.2 4.6 22.6V9.4L16 2.8Z" stroke="currentColor" strokeWidth="1.2"/><path d="m16 7.2 7.6 4.4v8.8L16 24.8l-7.6-4.4v-8.8L16 7.2Z" stroke="currentColor" strokeWidth="1.2"/><path d="m16 11.1 4.2 2.45v4.9L16 20.9l-4.2-2.45v-4.9L16 11.1Z" fill="currentColor"/></svg>; }

function useNetworkStatus() {
  const [status, setStatus] = useState<RpcStatus>({ loading: true, error: '', chainId: null, blockNumber: null, blockTimestamp: null, checkedAt: null });
  const refresh = useCallback(async () => {
    setStatus(s => ({ ...s, loading: true, error: '' }));
    try {
      const [chainHex, block] = await Promise.all([rpc<string>('eth_chainId'), rpc<{ number: string; timestamp: string } | null>('eth_getBlockByNumber', ['latest', false])]);
      const chainId = hexInt(chainHex);
      if (!block) throw new Error('Latest block was not returned by the RPC endpoint.');
      setStatus({ loading: false, error: chainId === CHAIN_ID ? '' : `Unexpected chain ID ${chainId ?? 'unknown'}; expected ${CHAIN_ID}.`, chainId, blockNumber: block.number, blockTimestamp: hexInt(block.timestamp), checkedAt: Date.now() });
    } catch (error) {
      setStatus({ loading: false, error: error instanceof Error ? error.message : 'Could not reach Monad Testnet RPC.', chainId: null, blockNumber: null, blockTimestamp: null, checkedAt: Date.now() });
    }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 30000); return () => window.clearInterval(timer); }, [refresh]);
  return { ...status, refresh };
}
function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const refresh = useCallback(async () => {
    if (!window.ethereum) { setAddress(null); return; }
    try {
      const [accounts, chain] = await Promise.all([window.ethereum.request({ method: 'eth_accounts' }) as Promise<string[]>, window.ethereum.request({ method: 'eth_chainId' }) as Promise<string>]);
      setAddress(accounts[0] ?? null); setChainId(hexInt(chain));
    } catch { setAddress(null); }
  }, []);
  useEffect(() => { void refresh(); const accountHandler = () => void refresh(); const chainHandler = () => void refresh(); window.ethereum?.on?.('accountsChanged', accountHandler); window.ethereum?.on?.('chainChanged', chainHandler); return () => { window.ethereum?.removeListener?.('accountsChanged', accountHandler); window.ethereum?.removeListener?.('chainChanged', chainHandler); }; }, [refresh]);
  const connect = useCallback(async () => {
    setError('');
    if (!window.ethereum) { setError('No injected EIP-1193 wallet detected. Install or enable a browser wallet to continue.'); return null; }
    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const chain = await window.ethereum.request({ method: 'eth_chainId' }) as string;
      setAddress(accounts[0] ?? null); setChainId(hexInt(chain));
      if (hexInt(chain) !== CHAIN_ID) setError(`Wallet is on chain ${hexInt(chain) ?? 'unknown'}. Switch to Monad Testnet (${CHAIN_ID}) in your wallet before signing.`);
      return accounts[0] ?? null;
    } catch (e) { setError(e instanceof Error ? e.message : 'Wallet connection was rejected.'); return null; }
    finally { setConnecting(false); }
  }, []);
  const switchNetwork = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x279f' }] });
      await refresh();
    } catch (switchError: unknown) {
      const err = switchError as { code?: number };
      if (err?.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{ chainId: '0x279f', chainName: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: ['https://testnet-rpc.monad.xyz'], blockExplorerUrls: ['https://testnet.monadvision.com'] }],
          });
          await refresh();
        } catch { /* ignored */ }
      }
    }
  }, [refresh]);
  return { address, chainId, error, connecting, connect, refresh, switchNetwork };
}

const navigation = [
  { href: '/', label: 'Network', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: Search },
  { href: '/contract-lab', label: 'Contract lab', icon: Blocks },
  { href: '/benchmarks', label: 'Benchmarks', icon: Gauge },
  { href: '/reports', label: 'Reports', icon: FileCheck2 },
];
function Shell({ children, wallet, rpcStatus }: { children: ReactNode; wallet: ReturnType<typeof useWallet>; rpcStatus: ReturnType<typeof useNetworkStatus> }) {
  const [location] = useLocation();
  const page = navigation.find(item => item.href === location)?.label ?? 'Network';
  const isWrongNetwork = Boolean(wallet.address && wallet.chainId !== CHAIN_ID);
  const connect = async () => {
    if (isWrongNetwork) {
      await wallet.switchNetwork();
      return;
    }
    if (wallet.address) return;
    await wallet.connect();
  };
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand" title="Monarch Lens">
        <img src={`${import.meta.env.BASE_URL}monarch-lens-logo.png`} alt="Monarch Lens" className="brand-logo-img" />
      </Link>
      <div className="nav-label">WORKSPACE</div>
      <nav>{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon/><span>{label}</span></Link>)}</nav>
      <div className="sidebar-bottom">
        <div className="network-chip">
          <div className="net-head">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`live-dot ${rpcStatus.error ? 'fail-text' : ''}`}/>
              <span>Monad Testnet</span>
            </span>
            <span className="badge neutral mono" style={{ padding: '2px 6px', fontSize: '9px' }}>10143</span>
          </div>
          <div className="net-sub">{rpcStatus.loading ? 'SYNCING RPC…' : rpcStatus.error?.startsWith('Unexpected chain ID') ? 'CHAIN MISMATCH' : rpcStatus.error ? 'RPC UNAVAILABLE' : rpcStatus.blockNumber ? `BLOCK #${hexInt(rpcStatus.blockNumber)?.toLocaleString()}` : 'CHAIN 10143 · LIVE'}</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', padding: '2px 6px 0', fontSize: '10px' }}>
          <a href="https://testnet.monadvision.com" target="_blank" rel="noreferrer" style={{ color: '#9D8DF1', textDecoration: 'none', fontWeight: 600 }}>MonadVision ↗</a>
          <span style={{ color: '#555' }}>·</span>
          <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer" style={{ color: '#9D8DF1', textDecoration: 'none', fontWeight: 600 }}>Faucet ↗</a>
        </div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="crumb">
          <span style={{ color: '#836EF9', fontWeight: 700 }}>MONARCH LENS</span>
          <ChevronRight size={12}/>
          <span className="crumb-current">{page.toUpperCase()}</span>
        </div>
        <div className="top-right">
          <div className="top-network">
            <span className={`live-dot ${rpcStatus.error ? 'fail-text' : ''}`}/>
            <span>{rpcStatus.error ? 'RPC issue' : 'Monad Testnet (10143)'}</span>
          </div>
          <button
            className="wallet-button"
            onClick={connect}
            data-testid="button-connect-wallet"
            style={isWrongNetwork ? { borderColor: '#F87171', color: '#FCA5A5' } : {}}
          >
            <Wallet/>
            {isWrongNetwork
              ? 'Switch to Monad (10143)'
              : wallet.address
              ? short(wallet.address, 6, 4)
              : wallet.connecting
              ? 'Connecting…'
              : 'Connect wallet'}
          </button>
        </div>
      </header>
      {wallet.error && <div style={{padding:'14px 36px 0'}}><div className="inline-message">{wallet.error}</div></div>}
      {children}
    </main>
  </div>;
}
function PageHead({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="page-desc">{description}</p></div><div>{action}</div></div>; }
function Panel({ title, kicker, children, className = '' }: { title: string; kicker?: string; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}><div className="panel-head"><div className="panel-title">{title}</div>{kicker && <div className="panel-kicker">{kicker}</div>}</div>{children}</section>; }
function StateMessage({ error, success, neutral }: { error?: string; success?: string; neutral?: string }) { if (error) return <div className="inline-message" role="alert">{error}</div>; if (success) return <div className="inline-message success" role="status">{success}</div>; if (neutral) return <div className="inline-message neutral" role="status">{neutral}</div>; return null; }
function NetworkPage({ network }: { network: ReturnType<typeof useNetworkStatus> }) {
  const correct = network.chainId === CHAIN_ID && !network.error;
  return <div className="content fade-in">
    <div style={{
      background: 'linear-gradient(135deg, rgba(131, 110, 249, 0.16) 0%, rgba(14, 12, 24, 0.95) 100%)',
      border: '1px solid rgba(131, 110, 249, 0.28)',
      borderRadius: '12px',
      padding: '24px 28px',
      marginBottom: '26px',
      boxShadow: '0 4px 24px -2px rgba(0,0,0,0.5), 0 0 20px -4px rgba(131,110,249,0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '20px',
      flexWrap: 'wrap'
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '8px' }}>
          <span className="live-dot" />
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9D8DF1' }}>
            MONAD TESTNET · HIGH-PERFORMANCE EVM
          </span>
          <span className="badge neutral mono" style={{ fontSize: '9px', padding: '2px 6px' }}>CHAIN 10143</span>
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px', color: '#FFFFFF', letterSpacing: '-0.03em' }}>
          Monad Developer Observability & Benchmarks
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: '#B4B0C2', maxWidth: '680px', lineHeight: '1.6' }}>
          Inspect live transaction execution receipts directly from the official public Monad RPC, run deterministic contract benchmarks, and verify cryptographic SHA-256 commitments onchain.
        </p>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <a href="https://testnet.monadvision.com" target="_blank" rel="noreferrer" className="button secondary">
          MonadVision ↗
        </a>
        <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer" className="button">
          Get Faucet MON ↗
        </a>
      </div>
    </div>
    <PageHead eyebrow="Network / 01" title="Testnet, observed." description="A direct view of Monad Testnet from its public JSON-RPC endpoint. No indexed or synthetic network metrics." action={<button className="button secondary" onClick={network.refresh} disabled={network.loading} data-testid="button-refresh-network"><RefreshCw size={13}/>{network.loading ? 'Checking RPC' : 'Refresh status'}</button>}/>
    <div className="grid-overview">
      <div className="panel status-panel"><div className="status-title">RPC endpoint</div><div className={`status-value ${correct ? 'ok-text' : network.loading ? '' : 'fail-text'}`}>{network.loading && !network.checkedAt ? 'Checking…' : correct ? 'Reachable' : 'Unavailable'}</div><div className="status-detail mono">{RPC}</div></div>
      <div className="panel status-panel"><div className="status-title">Verified chain ID</div><div className="status-value mono">{network.chainId === null ? '—' : network.chainId}</div><div className="status-detail">{network.chainId === CHAIN_ID ? 'Expected Monad Testnet' : network.chainId ? `Expected ${CHAIN_ID}` : 'Awaiting eth_chainId'}</div></div>
      <div className="panel status-panel"><div className="status-title">Latest block</div><div className="status-value mono">{network.blockNumber ? `#${hexInt(network.blockNumber)?.toLocaleString()}` : '—'}</div><div className="status-detail">{network.blockTimestamp ? formatDate(network.blockTimestamp * 1000) : 'No block timestamp available'}</div></div>
    </div>
    {network.error && <div style={{marginBottom:14}}><StateMessage error={network.error}/></div>}
    <div className="two-col">
      <Panel title="Connection check" kicker="LIVE RPC"><div className="panel-body">
        <div className="rpc-row"><div className="field-name">JSON-RPC method</div><div className="field-value">eth_chainId</div></div>
        <div className="rpc-row"><div className="field-name">Observed response</div><div className="field-value">{network.chainId === null ? network.loading ? 'pending' : 'no response' : `0x${network.chainId.toString(16)} (${network.chainId})`}</div></div>
        <div className="rpc-row"><div className="field-name">Expected network</div><div className="field-value">Monad Testnet / 10143</div></div>
        <div className="rpc-row"><div className="field-name">Last checked</div><div className="field-value">{formatDate(network.checkedAt)}</div></div>
      </div></Panel>
      <Panel title="Field notes" kicker="READ BEFORE USE"><div className="panel-body form-stack">
        <div className="code-note">Reads use the official public endpoint directly from this browser. Availability and response quality depend on that endpoint and your network.</div>
        <div className="code-note">Wallet transactions are signed by an injected EIP-1193 provider. Monarch Lens never handles keys or seed phrases.</div>
        <Link className="button secondary" href="/transactions">Inspect a transaction <ArrowRight size={13}/></Link>
      </div></Panel>
    </div>
    <div style={{marginTop:13}} className="as-of">AUTO-CHECKS EVERY 30 SECONDS · NO HISTORICAL INDEXER</div>
  </div>;
}

function TransactionPage({ network }: { network: ReturnType<typeof useNetworkStatus> }) {
  const [input, setInput] = useState(() => new URLSearchParams(window.location.search).get('hash') ?? '');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [transaction, setTransaction] = useState<TransactionInfo | null>(null);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const lookup = async (event: FormEvent) => {
    event.preventDefault(); setReceipt(null); setTransaction(null); setTimestamp(null); setError(''); setPending(false);
    if (!validHash(input)) { setError('Enter a 32-byte transaction hash beginning with 0x.'); return; }
    setLoading(true);
    try {
      const [result, transactionResult] = await Promise.all([
        rpc<Receipt | null>('eth_getTransactionReceipt', [input.trim()]),
        rpc<TransactionInfo | null>('eth_getTransactionByHash', [input.trim()]),
      ]);
      if (!result) {
        if (transactionResult) {
          setTransaction(transactionResult);
          setPending(true);
          return;
        }
        throw new Error('No transaction or receipt was returned. It may be unknown to this RPC or on another network.');
      }
      setReceipt(result);
      setTransaction(transactionResult);
      if (result.blockNumber) {
        try { const block = await rpc<{ timestamp: string } | null>('eth_getBlockByNumber', [result.blockNumber, false]); setTimestamp(hexInt(block?.timestamp) ?? null); } catch { setTimestamp(null); }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Transaction lookup failed.'); }
    finally { setLoading(false); }
  };
  const fee = transaction?.gas && receipt?.effectiveGasPrice
    ? weiToEth(`0x${(BigInt(transaction.gas) * BigInt(receipt.effectiveGasPrice)).toString(16)}`)
    : null;
  return <div className="content fade-in">
    <PageHead eyebrow="Explorer / 02" title="Transaction lookup" description="Fetch a receipt from the Monad Testnet RPC. Receipt gas reflects executed usage; it is not an estimate."/>
    <div className="two-col">
      <div className="form-stack">
        <Panel title="Receipt query" kicker="eth_getTransactionReceipt"><div className="panel-body form-stack">
            <form className="form-stack" onSubmit={lookup}>
              <div>
                <label className="input-label" htmlFor="tx-hash">Transaction hash</label>
                <input id="tx-hash" className="input mono" placeholder="0x…" value={input} onChange={e => setInput(e.target.value)} data-testid="input-transaction-hash"/>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                  <span style={{ fontSize: '10px', color: '#8C87A0', fontFamily: 'var(--app-font-mono)', fontWeight: 600 }}>TESTNET SAMPLES:</span>
                  {[
                    '0xf79b6bc811adca5760b9ae4fa3587a3b5c542358c92b3c59ba4578a51a4f3814',
                    '0x0c6834909796af0fe1ca03c9a8602debef8bbe901d92b0fe832a2df951f48af2',
                    '0x8830c23d943bc503c042868938b51f35c90b78bef99ad62aa33cbeb2c7545c32'
                  ].map(sample => (
                    <button key={sample} type="button" className="badge neutral mono" style={{ cursor: 'pointer', transition: 'all 0.15s ease' }} onClick={() => setInput(sample)} title="Click to fill sample hash">
                      {short(sample, 8, 6)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="button-row">
                <button className="button" type="submit" disabled={loading} data-testid="button-lookup-transaction">{loading ? <><LoaderCircle size={13}/>Querying RPC</> : <><Search size={13}/>Fetch transaction</>}</button>
                <button type="button" className="button ghost" onClick={() => {setInput('');setReceipt(null);setTransaction(null);setPending(false);setError('');setTimestamp(null);}}>Clear</button>
              </div>
            </form>
          <StateMessage error={error}/>
          {pending && <StateMessage neutral="Transaction found in the RPC but no receipt is available yet. It may still be pending; gas used and fee remain unavailable."/>}
          {!receipt && !pending && !loading && !error && <div className="empty-state"><strong>Receipt fields will appear here</strong>Paste a transaction hash to request its confirmed receipt directly from the configured RPC.</div>}
          {loading && <div className="empty-state"><strong>Request in progress</strong>Waiting for a receipt response from Monad Testnet.</div>}
        </div></Panel>
        <div className="disclaimer">Receipt availability is determined by the RPC. Pending transactions have no receipt yet. Block timestamp is fetched separately and may be unavailable.</div>
      </div>
      <Panel title="Receipt details" kicker={receipt ? short(receipt.transactionHash, 12, 10) : 'NO RECEIPT'}>
        {receipt || transaction ? <div className="detail-grid">
          <Detail label="Transaction hash" value={receipt?.transactionHash ?? transaction?.hash ?? 'Unavailable'}/>
          <Detail label="Status" value={receipt ? receipt.status === '0x1' ? 'Success' : receipt.status === '0x0' ? 'Reverted' : 'Unavailable' : 'Pending · no receipt'} tone={receipt?.status === '0x1' ? 'ok-text' : receipt?.status === '0x0' ? 'fail-text' : ''}/>
          <Detail label="Block number" value={hexInt(receipt?.blockNumber ?? transaction?.blockNumber ?? undefined)?.toLocaleString() ?? (pending ? 'Pending / unavailable' : 'Unavailable')}/>
          <Detail label="Block timestamp" value={timestamp ? formatDate(timestamp * 1000) : 'Unavailable'}/>
          <Detail label="From" value={receipt?.from ?? transaction?.from ?? 'Unavailable'}/>
          <Detail label="To" value={receipt?.to ?? transaction?.to ?? (transaction && !transaction.to ? 'Contract creation' : 'Unavailable')}/>
          <Detail label="Gas used · receipt" value={receipt?.gasUsed ? BigInt(receipt.gasUsed).toString() : 'Unavailable until receipt'}/>
          <Detail label="Gas limit · transaction" value={transaction?.gas ? BigInt(transaction.gas).toString() : 'Unavailable'}/>
          <Detail label="Effective gas price" value={weiToEth(receipt?.effectiveGasPrice) ?? (receipt?.effectiveGasPrice ? receipt.effectiveGasPrice : 'Unavailable')}/>
          <Detail label="Calculated fee · gas limit × effective price" value={fee ?? 'Unavailable'}/>
          <div className="detail-item"><div className="detail-label">MonadVision</div><div className="detail-value"><a href={`${TESTNET_EXPLORER}/tx/${receipt?.transactionHash ?? transaction?.hash}`} target="_blank" rel="noreferrer">Open transaction ↗</a></div></div>
        </div> : <div className="panel-body"><div className="empty-state"><strong>Awaiting transaction</strong>No transaction details to display.</div></div>}
      </Panel>
    </div>
  </div>;
}
function Detail({ label, value, tone = '' }: { label: string; value: ReactNode; tone?: string }) { return <div className="detail-item"><div className="detail-label">{label}</div><div className={`detail-value ${tone}`}>{value}</div></div>; }

function ContractLabPage({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const [address, setAddress] = useState(() => localStorage.getItem('monarch-lens-registry-address') ?? '');
  const [codeState, setCodeState] = useState<'idle'|'checking'|'deployed'|'empty'|'error'>('idle');
  const [codeError, setCodeError] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState('');
  const [value, setValue] = useState('0');
  const [txHash, setTxHash] = useState('');
  const [txError, setTxError] = useState('');
  const [pending, setPending] = useState(false);
  const [deployHash, setDeployHash] = useState('');
  const [deployStatus, setDeployStatus] = useState('');
  const [deployError, setDeployError] = useState('');
  const [deploying, setDeploying] = useState(false);
  const inspect = async (event: React.FormEvent) => {
    event.preventDefault(); setCodeError('');
    if (!validAddress(address)) { setCodeState('error'); setCodeError('Enter a valid 20-byte contract address.'); return; }
    setCodeState('checking');
    try {
      const code = await rpc<string>('eth_getCode', [address.trim(), 'latest']);
      if (!code || code === '0x') { setCodeState('empty'); return; }
      const probe = await rpc<string>('eth_call', [{ to: address.trim(), data: encodeGetReport(`0x${'0'.repeat(64)}`) }, 'latest']);
      const record = decodeReportRecord(probe);
      if (record.exists) throw new Error('The zero-hash registry probe unexpectedly returned a stored record.');
      setCodeState('deployed');
      localStorage.setItem('monarch-lens-registry-address', address.trim());
    } catch (e) {
      setCodeState('error');
      setCodeError(e instanceof Error ? e.message : 'Could not verify the ReportRegistry ABI response.');
    }
  };
  const send = async (event: FormEvent) => {
    event.preventDefault(); setTxError(''); setTxHash('');
    if (!validAddress(to)) { setTxError('Enter a valid recipient contract address.'); return; }
    if (!/^0x([a-fA-F0-9]{2})*$/.test(data || '0x')) { setTxError('Calldata must be 0x-prefixed, even-length hexadecimal bytes.'); return; }
    if (!/^\d+$/.test(value)) { setTxError('Native value must be a non-negative whole number of wei.'); return; }
    if (!window.ethereum) { setTxError('No injected wallet found. Transaction signing requires an EIP-1193 wallet.'); return; }
    setPending(true);
    try {
      const from = wallet.address ?? await wallet.connect();
      if (!from) { setTxError(wallet.error || 'Connect a wallet before signing.'); return; }
      const signingChain = hexInt(await window.ethereum.request({ method: 'eth_chainId' }) as string);
      if (signingChain !== CHAIN_ID) { setTxError(`Switch the connected wallet to Monad Testnet (${CHAIN_ID}) before signing.`); return; }
      const hash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from, to: to.trim(), data: data || '0x', value: `0x${BigInt(value).toString(16)}` }] }) as string;
      setTxHash(hash);
    } catch(e) { setTxError(e instanceof Error ? e.message : 'Wallet rejected or failed to submit transaction.'); }
    finally { setPending(false); }
  };
  const deploy = async () => {
    setDeployError(''); setDeployHash(''); setDeployStatus('');
    if (!window.ethereum) { setDeployError('No injected EIP-1193 wallet detected.'); return; }
    setDeploying(true);
    try {
      const from = wallet.address ?? await wallet.connect();
      if (!from) { setDeployError('Connect a wallet before deploying.'); return; }
      const signingChain = hexInt(await window.ethereum.request({ method: 'eth_chainId' }) as string);
      if (signingChain !== CHAIN_ID) { setDeployError(`Switch the connected wallet to Monad Testnet (${CHAIN_ID}) before signing.`); return; }
      setDeployStatus('Review the ReportRegistry creation transaction in your wallet. It is compiled from this project source using Solidity 0.8.28.');
      const hash = await window.ethereum.request({method:'eth_sendTransaction',params:[{from,data:REPORT_REGISTRY_CREATION_BYTECODE}]}) as string;
      setDeployHash(hash);
      setDeployStatus(`Submitted ${short(hash)}. Waiting for a Monad Testnet receipt before reporting a contract address.`);
      const receipt = await waitForReceipt(hash);
      if (!receipt) { setDeployStatus(`No receipt returned yet for ${hash}. The deployment remains pending; re-check it in transaction lookup.`); return; }
      if (receipt.status !== '0x1') { setDeployError(`Deployment receipt was not successful. Verify the transaction: ${hash}`); return; }
      if (!validAddress(receipt.contractAddress)) { setDeployError(`Receipt succeeded but did not include a contract address. Verify the deployment receipt: ${hash}`); return; }
      const contractAddress = receipt.contractAddress;
      setAddress(contractAddress);
      setCodeState('deployed');
      localStorage.setItem('monarch-lens-registry-address', contractAddress);
      setDeployStatus(`Verified successful receipt. Registry address saved in this browser: ${contractAddress}`);
    } catch(e) { setDeployError(e instanceof Error ? e.message : 'Wallet rejected or failed to submit deployment.'); }
    finally { setDeploying(false); }
  };
  return <div className="content fade-in">
    <PageHead eyebrow="Workspace / 03" title="Contract lab" description="Inspect deployed bytecode, deploy the project's report registry, or submit a user-signed contract call."/>
    <div className="two-col">
      <Panel title="Registry contract status" kicker="ETH_GETCODE"><div className="panel-body form-stack">
        <form className="form-stack" onSubmit={inspect}><div><label className="input-label" htmlFor="registry-address">Contract address</label><input id="registry-address" className="input" placeholder="0x…" value={address} onChange={e=>setAddress(e.target.value)} data-testid="input-registry-address"/></div><button className="button secondary" type="submit" disabled={codeState === 'checking'}>{codeState === 'checking' ? <><LoaderCircle size={13}/>Checking</> : <><Blocks size={13}/>Inspect address</>}</button></form>
        {codeState === 'deployed' && <><StateMessage success="Bytecode exists and the ReportRegistry getReport(bytes32) ABI probe returned a valid empty-record response. This does not verify source code."/><div className="helper"><a href={`${TESTNET_EXPLORER}/address/${address}`} target="_blank" rel="noreferrer">Open address in MonadVision ↗</a></div></>}
        {codeState === 'empty' && <StateMessage neutral="No contract bytecode returned. Address may be an EOA, undeployed address, or unavailable at the queried block."/>}
        {codeError && <StateMessage error={codeError}/>}
        <div className="code-note">Registry status checks bytecode plus the expected getter response. It does not establish source verification. Use Reports for the typed ReportRegistry write/read flow; the generic call remains ABI-agnostic.</div>
      </div></Panel>
      <Panel title="Submit contract call" kicker="EIP-1193 · USER SIGNED"><div className="panel-body form-stack">
        <form onSubmit={send} className="form-stack">
          <div><label className="input-label" htmlFor="call-to">Recipient</label><input id="call-to" className="input" placeholder="0x contract address" value={to} onChange={e=>setTo(e.target.value)} data-testid="input-call-address"/></div>
          <div><label className="input-label" htmlFor="call-data">Calldata</label><textarea id="call-data" className="textarea" placeholder="0x… (ABI-encoded call data)" value={data} onChange={e=>setData(e.target.value)} data-testid="input-call-data"/></div>
          <div><label className="input-label" htmlFor="call-value">Native value · wei</label><input id="call-value" className="input" type="number" min="0" value={value} onChange={e=>setValue(e.target.value)} data-testid="input-call-value"/></div>
          <button className="button" type="submit" disabled={pending}>{pending ? <><LoaderCircle size={13}/>Awaiting wallet</> : <><ArrowDownLeft size={13}/>Review & sign in wallet</>}</button>
        </form>
        {txError && <StateMessage error={txError}/>}
        {txHash && <div className="inline-message success">Submitted: <span className="mono mono-wrap">{txHash}</span><br/>Confirmation is not implied. <Link href={`/transactions?hash=${txHash}`} className="button ghost">Look up receipt <ArrowRight size={12}/></Link></div>}
        <div className="helper">Every write is reviewed and signed by your injected wallet. No private keys or seed-phrase input are requested here.</div>
      </div></Panel>
    </div>
    <div style={{marginTop:14}}><Panel title="Deploy Monarch Lens ReportRegistry" kicker={`SOLIDITY 0.8.28 · VERSION ${REPORT_REGISTRY_VERSION}`}><div className="panel-body two-col">
      <div className="form-stack">
        <div className="code-note">Deploys the source-controlled ReportRegistry from this project. The creation bytecode is compiler output, not user-entered data. Deployment is testnet-only and requires a connected wallet, Monad Testnet (chain 10143), and faucet-funded test MON.</div>
        <button className="button" type="button" onClick={deploy} disabled={deploying}>{deploying?<><LoaderCircle size={13}/>Waiting for wallet / receipt</>:<><Blocks size={13}/>Review & deploy registry</>}</button>
        {deployError&&<StateMessage error={deployError}/>}
        {deployStatus&&<StateMessage neutral={deployStatus}/>}
        {deployHash&&<div className="helper"><Link href={`/transactions?hash=${deployHash}`}>Inspect deployment transaction receipt ↗</Link></div>}
      </div>
      <div className="form-stack"><div className="code-note">The wallet displays the actual transaction and requests your signature. The app does not request, store, or log a private key or seed phrase. Confirm the network and transaction in your wallet before approving.</div><div className="disclaimer">Fees are paid in testnet tokens from the connected wallet. No mainnet transaction is submitted by this deploy control.</div></div>
    </div></Panel></div>
    <div style={{marginTop:14}} className="disclaimer">The UI deploy bytecode is compiled from this repository's ReportRegistry source. Review the Solidity and transaction details in your wallet before approving; bytecode compatibility checks are not a source audit.</div>
  </div>;
}

function loadRuns(): BenchRun[] {
  try {
    const saved = localStorage.getItem('monarch-lens-bench-runs');
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((run): run is BenchRun => Boolean(
      run && typeof run === 'object'
      && typeof run.txHash === 'string' && validHash(run.txHash)
      && typeof run.scenario === 'string'
      && (run.success === null || typeof run.success === 'boolean')
      && (run.gasUsed === null || (typeof run.gasUsed === 'string' && /^\d+$/.test(run.gasUsed)))
      && typeof run.timestamp === 'string'
      && (run.target === undefined || typeof run.target === 'string')
      && (run.calldata === undefined || typeof run.calldata === 'string')
      && (run.blockTimestamp === undefined || typeof run.blockTimestamp === 'string')
      && (run.blockNumber === undefined || typeof run.blockNumber === 'string')
      && (run.payloadHash === undefined || typeof run.payloadHash === 'string')
    ));
  } catch { return []; }
}
function BenchmarksPage({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const [runs, setRuns] = useState<BenchRun[]>(loadRuns);
  const [method, setMethod] = useState<'registry' | 'manual'>('registry');
  const [scenario, setScenario] = useState('report-registry-write');
  const [target, setTarget] = useState(() => localStorage.getItem('monarch-lens-registry-address') ?? '');
  const [calldata, setCalldata] = useState('');
  const [repeat, setRepeat] = useState('1');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const completed = useMemo(() => runs.filter(run => run.gasUsed !== null), [runs]);
  const outcomes = completed.filter(run => run.success !== null);
  const total = completed.length;
  const successCount = outcomes.filter(run => run.success === true).length;
  const average = total ? Math.round(completed.reduce((sum, r) => sum + Number(r.gasUsed), 0) / total) : null;
  const start = async (event: FormEvent) => {
    event.preventDefault(); setMessage('');
    const count = Number(repeat);
    if (!validAddress(target)) { setMessage('Enter a valid target contract address.'); return; }
    if (method === 'manual' && !/^0x([a-fA-F0-9]{2})*$/.test(calldata)) { setMessage('Provide even-length, 0x-prefixed calldata.'); return; }
    if (!Number.isInteger(count) || count < 1 || count > 3) { setMessage('Repeat count is limited to 1–3 user-confirmed transactions.'); return; }
    if (!window.ethereum) { setMessage('No injected EIP-1193 wallet detected.'); return; }
    setRunning(true);
    try {
      const account = wallet.address ?? await wallet.connect();
      if (!account) { setMessage('Connect your wallet before starting.'); return; }
      const signingChain = hexInt(await window.ethereum.request({ method: 'eth_chainId' }) as string);
      if (signingChain !== CHAIN_ID) { setMessage(`Switch to Monad Testnet (${CHAIN_ID}) in the wallet before starting.`); return; }
      for (let i = 0; i < count; i++) {
        setMessage(`Transaction ${i + 1} of ${count}: confirm in your wallet.`);
        const payloadHash = method === 'registry'
          ? await sha256Hex(stableJson({ kind: 'monarch-lens-benchmark', scenario: scenario.trim(), runId: crypto.randomUUID(), iteration: i + 1 }))
          : undefined;
        const txCalldata = method === 'registry' ? encodeRegisterReport(payloadHash!) : calldata;
        const from = wallet.address ?? (await window.ethereum.request({ method: 'eth_accounts' }) as string[])[0];
        const hash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from, to: target.trim(), data: txCalldata }] }) as string;
        const pendingRun: BenchRun = { scenario, txHash: hash, success: null, gasUsed: null, timestamp: new Date().toISOString(), target: target.trim(), calldata: txCalldata, payloadHash };
        setRuns(previous => { const next = [pendingRun, ...previous]; localStorage.setItem('monarch-lens-bench-runs', JSON.stringify(next)); return next; });
        setMessage(`Submitted ${short(hash)}. Waiting for its receipt…`);
        let receipt: Receipt | null = null;
        for (let attempt = 0; attempt < 40 && !receipt; attempt++) {
          await new Promise(resolve => window.setTimeout(resolve, 3000));
          try { receipt = await rpc<Receipt | null>('eth_getTransactionReceipt', [hash]); } catch { /* continue until the bounded receipt wait ends */ }
        }
        if (receipt) {
          let blockTimestamp: string | undefined;
          if (receipt.blockNumber) {
            try {
              const block = await rpc<{ timestamp: string } | null>('eth_getBlockByNumber', [receipt.blockNumber, false]);
              const seconds = hexInt(block?.timestamp);
              if (seconds !== null) blockTimestamp = new Date(seconds * 1000).toISOString();
            } catch { /* timestamp is unavailable; keep receipt-derived values */ }
          }
          const result: BenchRun = { scenario, txHash: hash, success: receipt.status === '0x1' ? true : receipt.status === '0x0' ? false : null, gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed).toString() : null, timestamp: new Date().toISOString(), blockTimestamp, blockNumber: receipt.blockNumber, target: target.trim(), calldata: txCalldata, payloadHash };
          setRuns(previous => { const next = previous.map(run => run.txHash === hash ? result : run); localStorage.setItem('monarch-lens-bench-runs', JSON.stringify(next)); return next; });
          setMessage(receipt.status === '0x1' ? `Successful receipt recorded for ${short(hash)}.` : receipt.status === '0x0' ? `Reverted receipt recorded for ${short(hash)}.` : `Receipt returned but did not include a recognized success status: ${short(hash)}.`);
        } else setMessage(`No receipt observed after two minutes for ${short(hash)}. The submitted transaction remains listed as pending; gas is not counted.`);
      }
    } catch(e) { setMessage(e instanceof Error ? e.message : 'Benchmark transaction failed or was rejected.'); }
    finally { setRunning(false); }
  };
  const clearRuns = () => { if (!window.confirm('Remove all locally stored benchmark receipts?')) return; localStorage.removeItem('monarch-lens-bench-runs'); setRuns([]); setMessage('Local benchmark history cleared.'); };
  return <div className="content fade-in">
    <PageHead eyebrow="Measurement / 04" title="Contract benchmarks" description="Receipt-backed ReportRegistry write tests or manual contract calls. Each transaction requires wallet confirmation; repeat count is capped at three."/>
    <div className="grid-overview">
      <div className="panel status-panel"><div className="status-title">Completed receipts</div><div className="status-value mono">{total}</div><div className="status-detail">Stored locally in this browser</div></div>
      <div className="panel status-panel"><div className="status-title">Successful receipts</div><div className="status-value mono">{outcomes.length ? `${((successCount/outcomes.length)*100).toFixed(1)}%` : '—'}</div><div className="status-detail">{outcomes.length ? `${successCount} of ${outcomes.length} receipts with known status` : 'No completed outcomes'}</div></div>
      <div className="panel status-panel"><div className="status-title">Mean receipt gas</div><div className="status-value mono">{average === null ? '—' : average.toLocaleString()}</div><div className="status-detail">n={total} · gas used only · no estimates</div></div>
    </div>
    <div className="two-col">
      <Panel title="Run a controlled call" kicker="USER ACTION REQUIRED"><div className="panel-body form-stack">
        <form className="form-stack" onSubmit={start}>
          <div><label className="input-label" htmlFor="bench-method">Scenario type</label><select id="bench-method" className="select" value={method} onChange={event => { const next = event.target.value as 'registry' | 'manual'; setMethod(next); if (next === 'registry') { setScenario('report-registry-write'); setTarget(localStorage.getItem('monarch-lens-registry-address') ?? target); } else setScenario('manual-contract-call'); }}><option value="registry">ReportRegistry · unique report-hash write</option><option value="manual">Manual contract call</option></select></div>
          <div><label className="input-label" htmlFor="bench-scenario">Scenario label</label><input id="bench-scenario" className="input" value={scenario} onChange={event => setScenario(event.target.value)} maxLength={64} required data-testid="input-benchmark-scenario"/></div>
          <div><label className="input-label" htmlFor="bench-target">Contract address</label><input id="bench-target" className="input" placeholder="0x…" value={target} onChange={event => setTarget(event.target.value)} data-testid="input-benchmark-address"/></div>
          <div><label className="input-label" htmlFor="bench-calldata">Calldata</label><textarea id="bench-calldata" className="textarea" placeholder={method === 'registry' ? 'ABI calldata generated per call from a unique SHA-256 payload' : '0x… ABI-encoded contract call'} value={method === 'registry' ? 'Generated for each transaction using the ReportRegistry ABI.' : calldata} onChange={event => setCalldata(event.target.value)} disabled={method === 'registry'} data-testid="input-benchmark-calldata"/></div>
          <div><label className="input-label" htmlFor="bench-count">Manual repeat count (maximum 3)</label><select id="bench-count" className="select" value={repeat} onChange={event => setRepeat(event.target.value)} data-testid="select-benchmark-count"><option value="1">1 transaction</option><option value="2">2 transactions</option><option value="3">3 transactions</option></select></div>
          <button className="button" type="submit" disabled={running}>{running ? <><LoaderCircle size={13}/>Run in progress</> : <><FlaskConical size={13}/>Begin benchmark</>}</button>
        </form>
        {message && <StateMessage neutral={message}/>}
        <div className="helper">Each transaction is submitted individually. The browser waits for each receipt before continuing. No automatic, unattended, or background load generation.</div>
      </div></Panel>
      <Panel title="Method & limitations" kicker="READ BEFORE COMPARISON"><div className="panel-body form-stack">
        <div className="code-note">Call data, target address, wallet, RPC conditions, and chain state all affect observed gas. This is not a controlled laboratory environment.</div>
        <div className="code-note">Gas used is read from a mined receipt. Pending or receipt-less transactions are excluded from gas averages; success rate uses receipts with an explicit status. Block time comes from the RPC when available; receipt-observed time is local browser time.</div>
        <div className="code-note">History is stored in this browser only. Clearing site storage removes it. Results do not imply network-wide performance.</div>
        <div className="button-row"><span className="panel-kicker">HISTORY / {runs.length} ENTRIES</span><button className="button ghost" onClick={clearRuns} disabled={!runs.length || running}>Clear local history</button></div>
      </div></Panel>
    </div>
    <div style={{marginTop:14}}><Panel title="Run receipts" kicker="REAL RPC RECEIPTS ONLY">
       {runs.length ? <div className="table-wrap"><table><thead><tr><th>Scenario</th><th>Transaction</th><th>Outcome</th><th>Gas · receipt</th><th>Block time</th><th>Receipt observed</th></tr></thead><tbody>{runs.map(run=><tr key={run.txHash} data-testid={`row-benchmark-${run.txHash}`}><td>{run.scenario}</td><td><Link href={`/transactions?hash=${run.txHash}`} className="mono">{short(run.txHash)}</Link></td><td><span className={`badge ${run.gasUsed === null ? 'pending' : run.success === true ? '' : 'neutral'}`}>{run.gasUsed === null ? 'Pending receipt' : run.success === true ? 'Success' : run.success === false ? 'Reverted' : 'Status unavailable'}</span></td><td>{run.gasUsed ?? '—'}</td><td>{run.blockTimestamp ? formatDate(run.blockTimestamp) : 'Unavailable'}</td><td>{formatDate(run.timestamp)}</td></tr>)}</tbody></table></div> : <div className="panel-body"><div className="empty-state"><strong>No recorded runs</strong>Complete a manually signed call and wait for its on-chain receipt to populate this table.</div></div>}
    </Panel></div>
  </div>;
}

type ReportData = { network: string; chainId: number; contractAddress: string; contractVersion: string; scenario: string; parameters: { target: string; calldata: string }; runCount: number; createdAt: string; runs: { txHash: string; gasUsed: string | null; success: boolean | null; timestamp: string; blockTimestamp?: string; blockNumber?: string; target?: string; calldata?: string; payloadHash?: string }[]; successRate: number | null; methodology: string; softwareVersion: string };
function ReportsPage({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const [runs] = useState<BenchRun[]>(loadRuns);
  const [registry, setRegistry] = useState(() => localStorage.getItem('monarch-lens-registry-address') ?? '');
  const [version, setVersion] = useState(REPORT_REGISTRY_VERSION);
  const [scenario, setScenario] = useState('');
  const [params, setParams] = useState('');
  const [report, setReport] = useState<ReportData | null>(null);
  const [canonical, setCanonical] = useState('');
  const [hash, setHash] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [registerTo, setRegisterTo] = useState(() => localStorage.getItem('monarch-lens-registry-address') ?? '');
  const [registrationTx, setRegistrationTx] = useState('');
  const [verifyAddress, setVerifyAddress] = useState(() => localStorage.getItem('monarch-lens-registry-address') ?? '');
  const [verifyResult, setVerifyResult] = useState('');
  const [suppliedJson, setSuppliedJson] = useState('');
  const [suppliedHash, setSuppliedHash] = useState('');
  const [verifiedReportHash, setVerifiedReportHash] = useState('');
  const [suppliedResult, setSuppliedResult] = useState('');
  const eligible = runs.filter(run => run.gasUsed !== null);
  const outcomes = eligible.filter(run => run.success !== null);
  const createReport = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setStatus(''); setHash(''); setReport(null); setVerifiedReportHash('');
    if (!scenario.trim()) { setError('Provide a scenario name before creating a report.'); return; }
    setBusy(true);
    try {
      const parameterLines = params.trim().split('\n');
      const payload: ReportData = {
        network: 'Monad Testnet',
        chainId: CHAIN_ID,
        contractAddress: registry.trim() || 'not specified',
        contractVersion: version.trim() || 'not specified',
        scenario: scenario.trim(),
        parameters: {
          target: parameterLines.find(line => line.startsWith('target='))?.slice(7) ?? ([...new Set(eligible.map(run => run.target).filter((value): value is string => Boolean(value)))].join(', ') || 'not specified'),
          calldata: parameterLines.find(line => line.startsWith('calldata='))?.slice(9) ?? (new Set(eligible.map(run => run.calldata)).size > 1 ? 'varies by run; see runs' : eligible.find(run => run.calldata)?.calldata ?? 'not specified'),
        },
        runCount: eligible.length,
        createdAt: new Date().toISOString(),
        runs: eligible.map(run => ({ txHash: run.txHash, gasUsed: run.gasUsed, success: run.success, timestamp: run.timestamp, blockTimestamp: run.blockTimestamp, blockNumber: run.blockNumber, target: run.target, calldata: run.calldata, payloadHash: run.payloadHash })).sort((a, b) => a.txHash.localeCompare(b.txHash)),
        successRate: outcomes.length ? outcomes.filter(run => run.success === true).length / outcomes.length : null,
        methodology: 'Manual user-signed contract calls. Gas and outcomes are read from receipts; pending and receipt-less transactions are excluded from aggregates. Block time is queried from RPC when available; receipt-observed time is local browser time. History is browser-local; RPC and chain conditions vary.',
        softwareVersion: SOFTWARE_VERSION,
      };
      const normalized = stableJson(payload);
      const reportHash = await sha256Hex(normalized);
      setReport(payload); setCanonical(normalized); setHash(reportHash);
      setStatus('Report generated from completed browser-local receipts. Object keys are sorted recursively before hashing.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create report hash.'); }
    finally { setBusy(false); }
  };

  const register = async () => {
    setError(''); setStatus(''); setRegistrationTx('');
    const reportHash = verifiedReportHash || hash;
    if (!validHash(reportHash)) { setError('Create a report or verify supplied report JSON before registering its hash.'); return; }
    if (!validAddress(registerTo)) { setError('Enter the deployed registry contract address.'); return; }
    if (!window.ethereum) { setError('No injected EIP-1193 wallet detected.'); return; }
    setBusy(true);
    try {
      const account = wallet.address ?? await wallet.connect();
      if (!account) { setError('Connect a wallet before registering.'); return; }
      const signingChain = hexInt(await window.ethereum.request({ method: 'eth_chainId' }) as string);
      if (signingChain !== CHAIN_ID) { setError(`Switch to Monad Testnet (${CHAIN_ID}) before signing.`); return; }
      const tx = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: account, to: registerTo.trim(), data: encodeRegisterReport(reportHash) }],
      }) as string;
      setRegistrationTx(tx);
      setStatus(`Submitted ${short(tx)}. Waiting for its real receipt before reporting registration as successful.`);
      const receipt = await waitForReceipt(tx);
      if (!receipt) { setStatus(`No receipt returned yet. The transaction remains pending or unavailable. Inspect it in MonadVision: ${tx}`); return; }
      if (receipt.status !== '0x1') { setError(`Registration receipt is not successful. Inspect transaction ${tx}.`); return; }
      setStatus(`Registry accepted the report hash in a successful receipt. Transaction: ${tx}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Wallet submission was rejected or failed.'); }
    finally { setBusy(false); }
  };

  const verifySuppliedReport = async () => {
    setSuppliedResult(''); setVerifiedReportHash('');
    if (!suppliedJson.trim()) { setSuppliedResult('Paste the supplied report JSON first.'); return; }
    if (!validHash(suppliedHash)) { setSuppliedResult('Enter the expected 32-byte SHA-256 hash to compare against.'); return; }
    try {
      const parsed: unknown = JSON.parse(suppliedJson);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setSuppliedResult('The supplied report must be a JSON object.');
        return;
      }
      const digest = await sha256Hex(stableJson(parsed));
      if (digest.toLowerCase() !== suppliedHash.trim().toLowerCase()) {
        setSuppliedResult(`Mismatch. Canonical report hash is ${digest}; the supplied expected hash differs.`);
        return;
      }
      setVerifiedReportHash(digest);
      setSuppliedResult(`Match. Canonical SHA-256: ${digest}. This proves content consistency only, not the truth of its claims.`);
    } catch (e) { setSuppliedResult(e instanceof Error ? e.message : 'Could not parse or hash the supplied report.'); }
  };

  const verifyRegistry = async () => {
    setVerifyResult('');
    const reportHash = verifiedReportHash || hash;
    if (!verifiedReportHash && hash && canonical) {
      try {
        const actual = await sha256Hex(canonical);
        if (actual.toLowerCase() !== hash.toLowerCase()) { setVerifyResult('Local report content no longer matches its displayed hash.'); return; }
      } catch (e) { setVerifyResult(e instanceof Error ? e.message : 'Could not re-hash the report.'); return; }
    }
    if (!validHash(reportHash)) { setVerifyResult('Create a report or verify a supplied report JSON first.'); return; }
    if (!validAddress(verifyAddress)) { setVerifyResult('Enter the deployed ReportRegistry address.'); return; }
    try {
      const response = await rpc<string>('eth_call', [{ to: verifyAddress.trim(), data: encodeGetReport(reportHash) }, 'latest']);
      const record = decodeReportRecord(response);
      if (!record.exists) { setVerifyResult(`No registry record found for ${reportHash}.`); return; }
      setVerifyResult(`Onchain record found for ${reportHash}; submitter ${record.submitter}; registered ${formatDate(Number(record.registeredAt) * 1000)}. The commitment does not prove report claims are true.`);
    } catch (e) { setVerifyResult(e instanceof Error ? e.message : 'Registry read failed.'); }
  };

  const copyHash = async () => {
    if (!hash) return;
    try { await navigator.clipboard.writeText(hash); setStatus('Report hash copied.'); }
    catch { setStatus('Clipboard permission unavailable; select and copy the hash manually.'); }
  };
  return <div className="content fade-in">
    <PageHead eyebrow="Attestation / 05" title="Reports" description="Canonical JSON and SHA-256 from completed receipts, with wallet-signed registration and ABI-aware verification."/>
    <div className="two-col">
      <Panel title="Build a deterministic report" kicker="SHA-256 / CANONICAL JSON"><div className="panel-body form-stack">
        <form onSubmit={createReport} className="form-stack">
          <div><label className="input-label" htmlFor="report-scenario">Scenario</label><input id="report-scenario" className="input" value={scenario} onChange={event => setScenario(event.target.value)} placeholder="e.g. report-registry-write" required data-testid="input-report-scenario"/></div>
          <div><label className="input-label" htmlFor="report-registry">Contract address</label><input id="report-registry" className="input" value={registry} onChange={event => setRegistry(event.target.value)} placeholder="0x… (optional)" data-testid="input-report-contract"/></div>
          <div><label className="input-label" htmlFor="report-version">Contract version</label><input id="report-version" className="input" value={version} onChange={event => setVersion(event.target.value)} placeholder="release or source revision" data-testid="input-report-version"/></div>
          <div><label className="input-label" htmlFor="report-params">Parameters (one key=value per line)</label><textarea id="report-params" className="textarea" value={params} onChange={event => setParams(event.target.value)} placeholder={'target=0x…\ncalldata=0x…'} data-testid="input-report-parameters"/></div>
          <div className="helper">Completed receipts currently available in this browser: <span className="mono">{eligible.length}</span>. Includes transaction hashes, receipt gas, outcomes and timestamps.</div>
          <button className="button" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={13}/>Computing hash</> : <><Fingerprint size={13}/>Create content hash</>}</button>
        </form>
        {error && <StateMessage error={error}/>}
        {status && <StateMessage neutral={status}/>}
      </div></Panel>
      <Panel title="Report content" kicker={hash?short(hash,10,8):'AWAITING REPORT'}>
        {report && hash ? <div className="panel-body form-stack">
          <div><div className="input-label">SHA-256 report hash</div><div className="inline-message neutral mono mono-wrap">{hash}</div></div>
          <div className="button-row">
            <button className="button secondary" onClick={copyHash}><Copy size={13}/>Copy hash</button>
            <button className="button secondary" onClick={() => { const blob = new Blob([canonical], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `monarch-report-${hash.slice(2, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); }}>Export canonical JSON</button>
          </div>
          <div className="rpc-row"><div className="field-name">Network / chain ID</div><div className="field-value">{report.network} · {report.chainId}</div></div>
          <div className="rpc-row"><div className="field-name">Contract / version</div><div className="field-value">{short(report.contractAddress)} · {report.contractVersion}</div></div>
          <div className="rpc-row"><div className="field-name">Scenario / completed runs</div><div className="field-value">{report.scenario} · {report.runCount}</div></div>
          <div className="rpc-row"><div className="field-name">Recorded / success rate</div><div className="field-value">{formatDate(report.createdAt)} · {report.successRate === null ? '—' : `${(report.successRate * 100).toFixed(1)}%`}</div></div>
          <div className="disclaimer">A hash proves the report content matches this digest. It does not independently prove that claims or inputs are true, nor that the hash was registered.</div>
        </div>:<div className="panel-body"><div className="empty-state"><strong>Report not created</strong>Build a report to view canonical content and its SHA-256 digest.</div></div>}
      </Panel>
    </div>
    <div style={{marginTop:14}}><Panel title="Verify a supplied report" kicker="IMPORT / CANONICAL SHA-256"><div className="panel-body form-stack">
      <div className="two-col">
        <div><label className="input-label" htmlFor="supplied-report">Report JSON</label><textarea id="supplied-report" className="textarea" value={suppliedJson} onChange={event => setSuppliedJson(event.target.value)} placeholder="Paste an exported Monarch Lens report JSON object" data-testid="input-supplied-report"/></div>
        <div className="form-stack">
          <div><label className="input-label" htmlFor="supplied-report-hash">Expected SHA-256 hash</label><input id="supplied-report-hash" className="input mono" value={suppliedHash} onChange={event => setSuppliedHash(event.target.value)} placeholder="0x…"/></div>
          <button className="button secondary" onClick={verifySuppliedReport}><Check size={13}/>Compare report to hash</button>
        </div>
      </div>
      {suppliedResult && <StateMessage neutral={suppliedResult}/>}
      <div className="helper">Whitespace and object key order are normalized before hashing. Arrays keep their original order.</div>
    </div></Panel></div>
    <div style={{marginTop:14}}><Panel title="Register & verify on Monad Testnet" kicker={`REPORTREGISTRY ABI · ${REPORT_REGISTRY_VERSION}`}><div className="panel-body two-col">
      <div className="form-stack">
        <div className="section-label">Register report hash</div>
        <div><label className="input-label" htmlFor="register-target">Registry contract address</label><input id="register-target" className="input" value={registerTo} onChange={event => setRegisterTo(event.target.value)} placeholder="0x…" data-testid="input-report-registry"/></div>
        <button className="button" onClick={register} disabled={busy || !(hash || verifiedReportHash)}><ShieldCheck size={13}/>Review & sign registration</button>
        {registrationTx && <div className="helper"><a href={`${TESTNET_EXPLORER}/tx/${registrationTx}`} target="_blank" rel="noreferrer">Open registration in MonadVision ↗</a></div>}
        <div className="helper">Uses the source-controlled <span className="mono">registerReport(bytes32)</span> ABI method. The wallet prompts for each write; the app waits for and checks the actual receipt.</div>
      </div>
      <div className="form-stack">
        <div className="section-label">Read registry record</div>
        <div><label className="input-label" htmlFor="verify-address">ReportRegistry address</label><input id="verify-address" className="input" value={verifyAddress} onChange={event => setVerifyAddress(event.target.value)} placeholder="0x…"/></div>
        <button className="button secondary" onClick={verifyRegistry}><Check size={13}/>Check registry record</button>
        {verifyResult && <StateMessage neutral={verifyResult}/>}
        <div className="helper">Checks the generated report hash, or a supplied-report hash after it matches the expected digest. The response is decoded using this project's ABI.</div>
      </div>
      {status && <StateMessage neutral={status}/>}
    </div></Panel></div>
  </div>;
}

function AppRoutes() {
  const network=useNetworkStatus();
  const wallet=useWallet();
  return <Shell wallet={wallet} rpcStatus={network}><Switch>
    <Route path="/" component={()=><NetworkPage network={network}/>}/>
    <Route path="/transactions" component={()=><TransactionPage network={network}/>}/>
    <Route path="/contract-lab" component={()=><ContractLabPage wallet={wallet}/>}/>
    <Route path="/benchmarks" component={()=><BenchmarksPage wallet={wallet}/>}/>
    <Route path="/reports" component={()=><ReportsPage wallet={wallet}/>}/>
    <Route component={NotFound}/>
  </Switch></Shell>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary><AppRoutes/></ErrorBoundary></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
