'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Code2, Compass, ExternalLink, GitBranch, Github, Globe2, Hourglass, Layers3, LoaderCircle, LockKeyhole, Menu, Plus, Search, ShieldCheck, Sparkles, Trophy, Wallet, X, Zap } from 'lucide-react';
import { Bounty, Submission, browserRpc, bountyAbi, chainId, contractAddress, erc20Abi, explorerUrl, getContract, isConfigured, isMainnet, rpcUrl } from '@/lib/chain';

type View = 'explore' | 'mine' | 'submitted';
type Filter = 'all' | 'open' | 'awarded' | 'closed';
type Modal = 'create' | 'submit' | null;
type EthereumProvider = ethers.Eip1193Provider & { request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown> };

declare global { interface Window { ethereum?: EthereumProvider } }

const statuses = ['Open', 'Awarded', 'Cancelled', 'Refunded'];
const shorten = (value: string) => value.length > 16 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
const displayDate = (epoch: number) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(epoch * 1000));
const remaining = (epoch: number) => {
  const d = epoch - Date.now() / 1000;
  if (d <= 0) return 'Deadline passed';
  if (d < 3600) return `${Math.ceil(d / 60)}m left`;
  if (d < 86400) return `${Math.ceil(d / 3600)}h left`;
  return `${Math.ceil(d / 86400)} days left`;
};
const txError = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const e = error as { shortMessage?: string; reason?: string; message?: string };
    const s = e.shortMessage || e.reason || e.message || 'Unknown transaction error';
    if (/user rejected|user denied|ACTION_REJECTED/i.test(s)) return 'Transaction was rejected in your wallet.';
    return s.slice(0, 220);
  }
  return String(error);
};
const validHttpLink = (s: string) => { try { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol); } catch { return false; } };

export default function Home() {
  const [wallet, setWallet] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [view, setView] = useState<View>('explore');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [selected, setSelected] = useState<Bounty | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [amount, setAmount] = useState('0.01');
  const [token, setToken] = useState('ETH');
  const [deadline, setDeadline] = useState('');
  const [proof, setProof] = useState('');
  const [tokenInfo, setTokenInfo] = useState<Record<string, { decimals: number; symbol: string }>>({});
  const [mobileNav, setMobileNav] = useState(false);

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 7500); };
  const refresh = useCallback(async (offset = 0, append = false) => {
    if (!isConfigured) { setLoading(false); return; }
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const response = await fetch(`/api/bounties?offset=${offset}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Blockchain API unavailable (${response.status})`);
      const data = await response.json();
      setBounties(previous => append ? [...previous, ...(data.bounties as Bounty[])] : data.bounties);
      setTotal(data.total);
      setNextOffset(data.nextOffset);
    } catch (e) { notify(txError(e)); }
    finally { setLoading(false); setLoadingMore(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: 'eth_accounts' }).then((list) => {
      if (Array.isArray(list) && typeof list[0] === 'string') setWallet(list[0]);
    }).catch(() => {});
    const onAccounts = (accounts: unknown) => setWallet(Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : '');
    const provider = window.ethereum as EthereumProvider & { on?: (event: string, fn: (arg: unknown) => void) => void; removeListener?: (event: string, fn: (arg: unknown) => void) => void };
    provider.on?.('accountsChanged', onAccounts);
    return () => provider.removeListener?.('accountsChanged', onAccounts);
  }, []);

  useEffect(() => {
    const tokens = Array.from(new Set(bounties.filter(b => b.token !== ethers.ZeroAddress).map(b => b.token.toLowerCase()))).filter(address => !(address in tokenInfo));
    if (!tokens.length) return;
    let cancelled = false;
    const provider = new ethers.JsonRpcProvider(browserRpc, chainId, { staticNetwork: true });
    Promise.all(tokens.map(async (addr) => {
      try {
        const t = new ethers.Contract(addr, erc20Abi, provider);
        const [decimals, symbol] = await Promise.all([t.decimals(), t.symbol()]);
        return [addr, { decimals: Number(decimals), symbol: String(symbol).slice(0, 15) }] as const;
      } catch { return [addr, { decimals: 18, symbol: 'TOKEN' }] as const; }
    })).then(entries => { if (!cancelled) setTokenInfo(prev => ({ ...prev, ...Object.fromEntries(entries) })); });
    return () => { cancelled = true; };
  }, [bounties, tokenInfo]);

  async function connectWallet() {
    if (!window.ethereum) { notify('Install MetaMask, Rabby, or use a browser with an injected EVM wallet.'); return; }
    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (Array.isArray(accounts) && accounts[0]) setWallet(String(accounts[0]));
      await switchNetwork();
    } catch (e) { notify(txError(e)); }
    finally { setIsConnecting(false); }
  }

  async function switchNetwork() {
    if (!window.ethereum) throw new Error('No browser wallet found');
    const hexId = `0x${chainId.toString(16)}`;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
    } catch (error) {
      const code = (error as { code?: number })?.code;
      if (code !== 4902) throw error;
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: hexId, chainName: isMainnet ? 'Robinhood Chain' : 'Robinhood Chain Testnet',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [browserRpc], blockExplorerUrls: [explorerUrl]
        }]
      });
    }
  }

  async function signerContract() {
    if (!isConfigured) throw new Error('Escrow contract is not deployed yet');
    if (!window.ethereum) throw new Error('Connect a browser wallet first');
    await switchNetwork();
    const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
    setWallet(await signer.getAddress());
    return { signer, contract: getContract(signer) };
  }

  async function transact(task: () => Promise<ethers.ContractTransactionResponse>, success: string) {
    setBusy(true);
    try {
      const tx = await task();
      notify(`Transaction submitted: ${shorten(tx.hash)}. Awaiting confirmation…`);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Transaction did not succeed');
      notify(`${success} · Tx ${shorten(tx.hash)}`);
      setModal(null);
      setSelected(null);
      setProof('');
      await refresh();
    } catch (err) { notify(txError(err)); }
    finally { setBusy(false); }
  }

  async function createBounty(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 4 || title.length > 120) { notify('Title must be between 4 and 120 characters.'); return; }
    if (details.length > 800) { notify('Details must be under 800 characters.'); return; }
    const unix = Math.floor(new Date(deadline).getTime() / 1000);
    if (!Number.isFinite(unix) || unix < Math.floor(Date.now() / 1000) + 3600) { notify('Choose a deadline at least one hour in the future.'); return; }
    if (unix > Date.now() / 1000 + 90 * 86400) { notify('Maximum bounty duration is 90 days.'); return; }
    await transact(async () => {
      const { signer, contract } = await signerContract();
      let assetAddress = ethers.ZeroAddress;
      let decimals = 18;
      if (token !== 'ETH') {
        if (!ethers.isAddress(token)) throw new Error('Enter a valid ERC-20 token address.');
        assetAddress = token;
        const erc = new ethers.Contract(token, erc20Abi, signer);
        decimals = Number(await erc.decimals());
        if (decimals > 36) throw new Error('Unsupported token precision');
      }
      const value = ethers.parseUnits(amount, decimals);
      if (value <= 0n) throw new Error('Amount must be positive.');
      if (token !== 'ETH') {
        const erc = new ethers.Contract(token, erc20Abi, signer);
        const walletAddress = await signer.getAddress();
        if (await erc.allowance(walletAddress, contractAddress) < value) {
          notify('Step 1 of 2: approve the exact ERC-20 amount in your wallet.');
          const approve = await erc.approve(contractAddress, value);
          await approve.wait();
        }
      }
      return await contract.createBounty(title.trim(), details.trim(), assetAddress, value, unix, { value: token === 'ETH' ? value : 0n });
    }, 'Bounty published onchain');
  }

  async function submitWork(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!validHttpLink(proof)) { notify('Enter an accessible http:// or https:// proof URL.'); return; }
    if (proof.length > 400) { notify('Proof URL must be under 400 characters.'); return; }
    const id = selected.id;
    await transact(async () => (await signerContract()).contract.submitWork(id, proof.trim()), 'Work submitted onchain');
  }

  async function action(name: 'award' | 'cancel' | 'refundExpired', bounty: Bounty, index?: number) {
    await transact(async () => {
      const { contract } = await signerContract();
      if (name === 'award') return contract.award(bounty.id, index);
      if (name === 'cancel') return contract.cancel(bounty.id);
      return contract.refundExpired(bounty.id);
    }, name === 'award' ? 'Winner paid from escrow' : 'Escrow returned to bounty creator');
  }

  async function openDetail(bounty: Bounty) {
    setSelected(bounty);
    setSubmissions([]);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/bounties/${bounty.id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Unable to fetch submissions');
      const json = await res.json();
      setSelected(json.bounty);
      setSubmissions(json.submissions);
    } catch (e) { notify(txError(e)); }
    finally { setLoadingDetail(false); }
  }

  const listed = useMemo(() => bounties.filter(b => {
    if (view === 'mine' && (!wallet || b.creator.toLowerCase() !== wallet.toLowerCase())) return false;
    if (filter === 'open' && b.status !== 0) return false;
    if (filter === 'awarded' && b.status !== 1) return false;
    if (filter === 'closed' && b.status < 2) return false;
    return `${b.title} ${b.details} ${b.creator}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [bounties, wallet, view, filter, search]);

  const reward = (b: Bounty) => {
    const addr = b.token.toLowerCase();
    const isEth = addr === ethers.ZeroAddress;
    const info = isEth ? { decimals: 18, symbol: 'ETH' } : tokenInfo[addr];
    if (!info) return `... ${shorten(b.token)}`;
    const n = ethers.formatUnits(BigInt(b.amount), info.decimals);
    return `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 5 })} ${info.symbol}`;
  };

  const zeroOpen = bounties.filter(b => b.status === 0).length;
  const zeroAwarded = bounties.filter(b => b.status === 1).length;
  const summaryViews = [{ label: 'Total bounties', value: total, icon: Layers3 }, { label: 'Open in view', value: zeroOpen, icon: Zap }, { label: 'Awarded in view', value: zeroAwarded, icon: Trophy }];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'mobile-show' : ''}`}>
      <button className="brand" onClick={() => { setView('explore'); setMobileNav(false); }}>
        <span className="brand-icon"><span className="brand-spark">✳</span></span><span>robin<span className="brand-light">bounty</span><span className="brand-point">.</span></span>
      </button>
      <div className="side-caption">WORKSPACE</div>
      <nav className="nav-stack">
        <button className={`nav-item ${view === 'explore' ? 'active' : ''}`} onClick={() => { setView('explore'); setMobileNav(false); }}><Compass size={19} /> Discover bounties <ArrowUpRight size={15} className="nav-arrow" /></button>
        <button className={`nav-item ${view === 'mine' ? 'active' : ''}`} onClick={() => { setView('mine'); setMobileNav(false); }}><Layers3 size={19} /> My bounties</button>
        <button className={`nav-item ${view === 'submitted' ? 'active' : ''}`} onClick={() => { setView('submitted'); setMobileNav(false); }}><GitBranch size={19} /> How it works</button>
      </nav>
      <div className="side-caption resources-caption">RESOURCES</div>
      <nav className="nav-stack">
        <a className="nav-item" href="https://docs.robinhood.com/chain" target="_blank" rel="noopener noreferrer"><Code2 size={19} /> Chain documentation <ExternalLink size={13} className="nav-arrow" /></a>
        <a className="nav-item" href={explorerUrl} target="_blank" rel="noopener noreferrer"><Globe2 size={19} /> Block explorer <ExternalLink size={13} className="nav-arrow" /></a>
        <a className="nav-item" href="https://faucet.testnet.chain.robinhood.com" target="_blank" rel="noopener noreferrer"><ArrowDownLeft size={19} /> Testnet faucet <ExternalLink size={13} className="nav-arrow" /></a>
      </nav>
      <div className="sidebar-bottom">
        <div className="side-banner"><div className="side-banner-orbit"><Sparkles size={20} /></div><strong>Built for builders.</strong><p>Earn by shipping real work, not promises.</p><button onClick={() => setModal('create')}>Post a bounty <ArrowRight size={14}/></button></div>
        <div className="side-network"><span className="live-pulse" /> {isMainnet ? 'Robinhood Mainnet' : 'Robinhood Testnet'} <span className="chain-num">#{chainId}</span></div>
      </div>
    </aside>

    <main className="main-content">
      <header className="topbar">
        <button className="hamburger" aria-label="Open menu" onClick={() => setMobileNav(v => !v)}><Menu size={22}/></button>
        <div className="breadcrumb">Workspace <ChevronRight size={14} /> <span>{view === 'explore' ? 'Discover' : view === 'mine' ? 'My bounties' : 'How it works'}</span></div>
        <div className="top-actions"><span className="network-pill"><span className="live-pulse"/>{isMainnet ? 'Mainnet' : 'Testnet'}</span>
          <button className="connect-btn" onClick={() => void connectWallet()} disabled={isConnecting}><Wallet size={16}/>{wallet ? shorten(wallet) : isConnecting ? 'Connecting…' : 'Connect wallet'}</button>
        </div>
      </header>

      <div className="page-wrap">
        {view === 'submitted' ? <section className="how-page"><div className="eyebrow">THE PROTOCOL</div><h1>Work gets done.<br/><em>Builders get paid.</em></h1><p className="large-lead">No middlemen. Bounty rewards are escrowed in a transparent smart contract on Robinhood Chain.</p>
          <div className="steps-grid"><Step n="01" icon={<LockKeyhole size={24}/>} title="Fund a bounty" text="Project owners escrow ETH or supported ERC-20 tokens, define deliverables and set a deadline."/><Step n="02" icon={<Code2 size={24}/>} title="Ship your work" text="Developers submit a public URL to a GitHub repository, pull request, or working demo."/><Step n="03" icon={<Trophy size={24}/>} title="Creator picks a winner" text="The bounty creator selects one submission and the contract transfers the entire prize to that developer."/><Step n="04" icon={<ShieldCheck size={24}/>} title="Escrow safeguards" text="Unsubmitted bounties can be cancelled. If no winner is selected, refund becomes available seven days after the deadline."/></div>
          <div className="security-note"><CircleHelp size={20}/><div><strong>Understand the rules before participating.</strong><p>The bounty creator alone chooses the winner. Submission does not guarantee payment, and unawarded funds become refundable after the review window. All submitted URLs and descriptions are public and permanent onchain. Contracts have not received an independent audit.</p></div></div>
        </section> : <>
          <section className="hero"><div className="hero-text"><div className="eyebrow"><span className="eyebrow-dot"/> THE ONCHAIN BUILDER ECONOMY</div>
            <h1>{view === 'mine' ? <>Your ideas.<br/><em>Your rewards.</em></> : <>Build the future.<br/><em>Get rewarded.</em></>}</h1>
            <p>Discover real developer opportunities. Ship great work. Earn rewards secured by transparent onchain escrow.</p>
            <div className="hero-actions"><button className="primary-btn" onClick={() => setModal('create')}><Plus size={17}/> Create a bounty <ArrowUpRight size={16}/></button><button className="secondary-btn" onClick={() => setView('submitted')}>How it works <ArrowRight size={16}/></button></div>
          </div><div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-a"/><div className="art-orbit orbit-b"/><div className="art-orbit orbit-c"/><div className="art-glow"/><div className="art-card"><div className="art-card-top"><span className="art-small-dot"/> REWARD CONFIRMED</div><div className="art-symbol">✳</div><div className="art-card-foot"><span>ONCHAIN<br/>ESCROW</span><CheckCircle2 size={25}/></div></div><div className="art-cross cross-one">✳</div><div className="art-cross cross-two">+</div></div></section>

          {!isConfigured && <div className="deployment-banner"><div className="banner-icon"><LockKeyhole size={19}/></div><div><strong>Contract deployment required</strong><p>This frontend is configured for Robinhood Chain {isMainnet ? 'mainnet' : 'testnet'} but has no verified escrow contract address yet. No simulated rewards or fake bounties are shown.</p></div><a href="https://docs.robinhood.com/chain/deploy-smart-contracts/" target="_blank" rel="noopener noreferrer">Deployment guide <ArrowUpRight size={15}/></a></div>}

          <section className="stats-grid">{summaryViews.map(({ label, value, icon: Icon }) => <div className="stat-card" key={label}><div className="stat-head"><span>{label}</span><Icon size={18}/></div><strong>{value.toLocaleString()}</strong><div className="stat-foot"><span className="stat-foot-dot"/> Read from Robinhood Chain</div></div>)}</section>
          <section className="list-section"><div className="list-head"><div><div className="eyebrow small-eyebrow">EXPLORE OPPORTUNITIES</div><h2>{view === 'mine' ? 'Bounties you created' : 'Available bounties'}<span className="count-pill">{listed.length}</span></h2><p>Every reward shown here is backed by funds locked in the smart contract.</p></div><button className="outline-btn" onClick={() => void refresh()} disabled={loading}><LoaderCircle size={15} className={loading ? 'spinning' : ''}/> Refresh</button></div>
            <div className="filter-row"><div className="tabs">{(['all','open','awarded','closed'] as Filter[]).map(t => <button key={t} className={filter === t ? 'selected' : ''} onClick={() => setFilter(t)}>{t === 'all' ? 'All bounties' : t === 'closed' ? 'Closed' : t === 'awarded' ? 'Awarded' : 'Open'}</button>)}</div><label className="searchbox"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bounties…" aria-label="Search bounties"/></label></div>
            <div className="bounties-grid">{loading && !bounties.length ? <div className="empty-state"><LoaderCircle size={32} className="spinning"/><h3>Loading onchain bounties</h3><p>Reading data from Robinhood Chain.</p></div> : !listed.length ? <div className="empty-state"><div className="empty-graphic"><Layers3 size={32}/></div><h3>{!isConfigured ? 'Awaiting first deployment' : 'No bounties found'}</h3><p>{!isConfigured ? 'A verified smart contract is needed before real bounties can be published.' : view === 'mine' && !wallet ? 'Connect your wallet to view your bounties.' : 'Be the first to fund a bounty, or try a different filter.'}</p><button className="primary-btn smaller" onClick={() => setModal('create')}><Plus size={16}/> Create bounty</button></div> : listed.map(b => <button className="bounty-card" key={b.id} onClick={() => void openDetail(b)}><div className="card-topline"><span className={`status-pill state-${b.status}`}><span/> {statuses[b.status] || 'Unknown'}</span><span className="bounty-id">#{String(b.id + 1).padStart(4, '0')}</span></div><div className="bounty-body"><span className="bounty-tag"><Code2 size={13}/> Developer bounty</span><h3>{b.title}</h3><p>{b.details || 'Details are available from the bounty creator.'}</p></div><div className="card-reward"><span>ESCROWED REWARD</span><strong>{reward(b)}</strong></div><div className="card-footer"><span><Hourglass size={15}/>{b.status === 0 ? remaining(b.deadline) : displayDate(b.deadline)}</span><span><GitBranch size={15}/>{b.submissions} submission{b.submissions === 1 ? '' : 's'}</span><ArrowUpRight size={18} className="card-arrow"/></div></button>)}</div>
            {nextOffset !== null && <button className="load-more" disabled={loadingMore} onClick={() => void refresh(nextOffset, true)}>{loadingMore ? 'Loading…' : 'Load older bounties'} <ChevronDown size={16}/></button>}
          </section>
        </>}
        <footer className="footer"><span>© 2026 RobinBounty. Independent application, not affiliated with Robinhood.</span><span><ShieldCheck size={14}/> Open, verifiable, onchain.</span></footer>
      </div>
    </main>

    {notice && <div className="toast" role="status"><div><CheckCircle2 size={18}/><span>{notice}</span></div><button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={16}/></button></div>}
    {modal === 'create' && <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setModal(null); }}><div className="modal-panel" role="dialog" aria-modal="true" aria-label="Create bounty"><div className="modal-head"><div><div className="eyebrow small-eyebrow">CREATE AN OPPORTUNITY</div><h2>Fund a new bounty</h2></div><button className="icon-btn" disabled={busy} onClick={() => setModal(null)}><X size={20}/></button></div><form onSubmit={e => void createBounty(e)} className="modal-form"><label>Bounty title<input required minLength={4} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="Build an analytics dashboard" /></label><label>Description & deliverables<textarea maxLength={800} value={details} onChange={e => setDetails(e.target.value)} placeholder="What should developers deliver? Include acceptance criteria." rows={4}/><small>{details.length}/800 characters · stored publicly onchain</small></label><div className="form-grid"><label>Reward amount<input required type="number" min="0.000000001" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.05"/></label><label>Payment asset<select value={token === 'ETH' ? 'ETH' : 'ERC20'} onChange={e => setToken(e.target.value === 'ETH' ? 'ETH' : '')}><option value="ETH">ETH</option><option value="ERC20">ERC-20 token</option></select></label></div>{token !== 'ETH' && <label>ERC-20 contract address<input value={token} onChange={e => setToken(e.target.value)} placeholder="0x..." required/></label>}<label>Submission deadline<input required type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)}/><small>Minimum 1 hour, maximum 90 days. Unawarded funds refund after a further 7-day review window.</small></label><div className="form-tip"><LockKeyhole size={17}/> Funds are deposited directly into the onchain escrow. Only you can select the winning submission.</div><button type="submit" className="primary-btn full-width" disabled={busy || !isConfigured}>{busy ? <LoaderCircle className="spinning" size={17}/> : <LockKeyhole size={17}/>} {busy ? 'Confirming transaction…' : isConfigured ? 'Fund and publish bounty' : 'Deploy contract to enable'}</button></form></div></div>}
    {modal === 'submit' && selected && <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setModal(null); }}><div className="modal-panel" role="dialog" aria-modal="true" aria-label="Submit work"><div className="modal-head"><div><div className="eyebrow small-eyebrow">YOUR SUBMISSION</div><h2>Submit your work</h2></div><button className="icon-btn" disabled={busy} onClick={() => setModal(null)}><X size={20}/></button></div><form onSubmit={e => void submitWork(e)} className="modal-form"><div className="submit-context"><strong>{selected.title}</strong><span>{reward(selected)} escrowed</span></div><label>Public proof of work URL<input required type="url" value={proof} onChange={e => setProof(e.target.value)} maxLength={400} placeholder="https://github.com/yourname/your-repo"/><small>GitHub repository, pull request, working demo, or another public HTTPS link.</small></label><div className="form-tip"><CircleHelp size={17}/> Only one submission is allowed per wallet. The creator chooses a winner; payment is not guaranteed.</div><button type="submit" className="primary-btn full-width" disabled={busy}>{busy ? 'Confirming…' : 'Submit proof onchain'} <ArrowUpRight size={16}/></button></form></div></div>}
    {selected && modal !== 'submit' && <div className="detail-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setSelected(null); }}><section className="detail-drawer" role="dialog" aria-modal="true" aria-label="Bounty details"><div className="drawer-head"><span>BOUNTY DETAILS / #{String(selected.id + 1).padStart(4, '0')}</span><button className="icon-btn" onClick={() => setSelected(null)}><X size={20}/></button></div><div className="drawer-content"><span className={`status-pill state-${selected.status}`}><span/>{statuses[selected.status]}</span><h2>{selected.title}</h2><p className="drawer-description">{selected.details || 'No description provided.'}</p><div className="drawer-reward"><span>SECURED PRIZE</span><strong>{reward(selected)}</strong><span>Escrowed on Robinhood Chain</span></div><div className="detail-facts"><div><span>Created by</span><a href={`${explorerUrl}/address/${selected.creator}`} target="_blank" rel="noopener noreferrer">{shorten(selected.creator)} <ExternalLink size={12}/></a></div><div><span>Submission deadline</span><strong>{displayDate(selected.deadline)}</strong></div><div><span>Review ends</span><strong>{displayDate(selected.deadline + 7 * 86400)}</strong></div><div><span>Payment token</span><strong>{selected.token === ethers.ZeroAddress ? 'Native ETH' : shorten(selected.token)}</strong></div></div><h3 className="drawer-subtitle">Work submitted <span>{selected.submissions}</span></h3>{loadingDetail ? <div className="drawer-loader"><LoaderCircle className="spinning" size={20}/> Loading onchain submissions…</div> : submissions.length ? <div className="submission-list">{submissions.map(s => <div className="submission-item" key={s.index}><div><div className="sub-user"><span className="avatar-circle">{s.developer.slice(2,4).toUpperCase()}</span><strong>{shorten(s.developer)}</strong>{selected.winnerIndex === s.index + 1 && <span className="winner-tag"><Trophy size={12}/> WINNER</span>}</div><div className="sub-link">{validHttpLink(s.proofURI) ? <a href={s.proofURI} target="_blank" rel="noopener noreferrer">View submission <ArrowUpRight size={13}/></a> : <span>{s.proofURI}</span>} <span>· {displayDate(s.submittedAt)}</span></div></div>{selected.creator.toLowerCase() === wallet.toLowerCase() && selected.status === 0 && Date.now()/1000 <= selected.deadline + 7 * 86400 && <button disabled={busy} className="award-btn" onClick={() => void action('award', selected, s.index)}><Trophy size={14}/> Award</button>}</div>)}</div> : <div className="no-submissions">No submissions yet. Be the first to ship something great.</div>}
              {selected.status === 0 && Date.now() / 1000 < selected.deadline && wallet.toLowerCase() !== selected.creator.toLowerCase() && <button className="primary-btn full-width drawer-action" onClick={() => setModal('submit')}><GitBranch size={18}/> Submit work <ArrowRight size={16}/></button>}
              {selected.status === 0 && selected.submissions === 0 && wallet.toLowerCase() === selected.creator.toLowerCase() && <button disabled={busy} className="danger-btn" onClick={() => void action('cancel', selected)}>Cancel and withdraw unclaimed escrow</button>}
              {selected.status === 0 && Date.now() / 1000 > selected.deadline + 7 * 86400 && <button disabled={busy} className="danger-btn" onClick={() => void action('refundExpired', selected)}>Return expired escrow to creator</button>}
              <a className="drawer-explorer" href={`${explorerUrl}/address/${contractAddress}`} target="_blank" rel="noopener noreferrer">Verify escrow contract on Blockscout <ArrowUpRight size={16}/></a>
              <p className="drawer-warning"><ShieldCheck size={15}/> The creator decides who wins. Submission does not guarantee payment.</p>
            </div></section></div>}
  </div>;
}

function Step({ n, icon, title, text }: { n: string; icon: React.ReactNode; title: string; text: string }) {
  return <div className="step-card"><div className="step-top"><div className="step-icon">{icon}</div><span>{n}</span></div><h3>{title}</h3><p>{text}</p></div>;
}
