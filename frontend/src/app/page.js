"use client";
import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import QRCode from "react-qr-code";
import dynamic from 'next/dynamic';

const QrReader = dynamic(() => import('react-qr-reader').then(mod => mod.QrReader), { ssr: false });

// --- CONTRACT CONFIG (Local Hardhat) ---
const RPC_URL = "http://127.0.0.1:8545";
const USDC_ADDRESS = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853";
const ESCROW_ADDRESS = "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6";

const USDC_ABI = [
  "function transfer(address to, uint amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint)",
  "function approve(address spender, uint amount) returns (bool)",
  "function mint(address to, uint256 amount) public"
];

const ESCROW_ABI = [
  "function lockFunds(bytes32 transferId, uint256 amount)",
  "function releaseFunds(bytes32 transferId, address settlerNode, uint256 amount, uint256 deadline, bytes signature)",
  "function refundExpired(bytes32 transferId)"
];

export default function Home() {
  const [provider, setProvider] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isAgent, setIsAgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const API_BASE = "http://localhost:3001";

  // State for 'Send'
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");

  // State for 'Cash Out' (User)
  const [cashoutAmount, setCashoutAmount] = useState("");
  const [cashoutBankDetails, setCashoutBankDetails] = useState("");
  const [myOrderId, setMyOrderId] = useState(null);
  const [myOrderStatus, setMyOrderStatus] = useState("");
  const [myOtp, setMyOtp] = useState("");

  // State for 'Agent Hub' (Node)
  const [feed, setFeed] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [activeOrderDetails, setActiveOrderDetails] = useState(null);
  const [agentOtpInput, setAgentOtpInput] = useState("");
  const [agentSuccess, setAgentSuccess] = useState("");
  
  // Phase 5: Slip Upload & QR
  const [myOrderSlip, setMyOrderSlip] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState("digital"); // 'digital' or 'physical'
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [slipBase64, setSlipBase64] = useState("");

  const [stuckLocks, setStuckLocks] = useState([]);

  // 1. Initialize Provider & Burner Wallet
  useEffect(() => {
    const initWeb3 = async () => {
      const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
      setProvider(rpcProvider);

      let pk = localStorage.getItem("unified_burner_pk");
      if (!pk) {
        const newWallet = ethers.Wallet.createRandom();
        pk = newWallet.privateKey;
        localStorage.setItem("unified_burner_pk", pk);
      }
      
      const signer = new ethers.Wallet(pk, rpcProvider);
      setWallet(signer);
      
      // Check balances and Auto-Fund from Hardhat Account 0 if empty
      try {
        const ethBalance = await rpcProvider.getBalance(signer.address);
        if (ethBalance === 0n) {
          console.log("Funding burner wallet from Hardhat Rich Account...");
          const richSigner = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", rpcProvider);
          await richSigner.sendTransaction({ to: signer.address, value: ethers.parseEther("1.0") });
          const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, richSigner);
          await (await usdc.mint(signer.address, ethers.parseUnits("1000", 6))).wait();
        }
        await fetchBalance(signer);
      } catch (e) {
        console.error("Hardhat Node might not be running yet.", e);
      }
    };
    initWeb3();
  }, []);

  const fetchBalance = async (signer) => {
    if (!signer) return;
    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
    const bal = await usdc.balanceOf(signer.address);
    setBalance(ethers.formatUnits(bal, 6));
  };

  // Poll for Order Status (Sender)
  useEffect(() => {
    let interval;
    if (myOrderId && (myOrderStatus === "PENDING_MATCH" || myOrderStatus === "ACCEPTED" || myOrderStatus === "LOCKED")) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/cashout/status/${myOrderId}`);
          const data = await res.json();
          if (!data.error) {
            setMyOrderStatus(data.status);
            if (data.otp) setMyOtp(data.otp);
            if (data.slip_url) setMyOrderSlip(data.slip_url);
          }
        } catch (e) {}
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [myOrderId, myOrderStatus]);

  // Fetch Stuck Locks for Dashboard
  useEffect(() => {
    let interval;
    if (wallet && activeTab === "dashboard") {
      const fetchLocks = async () => {
        try {
          const res = await fetch(`${API_BASE}/cashout/my-locks/${wallet.address}`);
          const data = await res.json();
          setStuckLocks(Array.isArray(data) ? data : []);
        } catch(e) {}
      };
      fetchLocks();
      interval = setInterval(fetchLocks, 5000);
    }
    return () => clearInterval(interval);
  }, [wallet, activeTab]);

  // Poll for Feed (Agent)
  useEffect(() => {
    let interval;
    if (activeTab === "agent_hub" && !activeOrder) {
      const fetchFeed = async () => {
        try {
          const res = await fetch(`${API_BASE}/cashout/feed`);
          const data = await res.json();
          setFeed(Array.isArray(data) ? data : []);
        } catch (e) {
          setFeed([]);
        }
      };
      fetchFeed();
      interval = setInterval(fetchFeed, 3000);
    }
    return () => clearInterval(interval);
  }, [activeTab, activeOrder]);

  // --- ACTIONS ---

  const handleSendCrypto = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
      const amountWei = ethers.parseUnits(sendAmount.toString(), 6);
      const tx = await usdc.transfer(sendAddress, amountWei);
      await tx.wait(); 
      
      alert(`Successfully sent ${sendAmount} USDC to ${sendAddress}`);
      setActiveTab("dashboard");
      setSendAddress("");
      setSendAmount("");
      await fetchBalance(wallet);
    } catch (err) {
      alert("Transaction Failed: " + err.message);
    }
    setLoading(false);
  };

  const handleRequestCashout = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/cashout/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_wallet: wallet.address,
          amount_usdc: cashoutAmount,
          amount_fiat: cashoutAmount * 3000, 
          currency: "MMK",
          bank_details: cashoutBankDetails
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMyOrderId(data.transfer_id);
      setMyOrderStatus("PENDING_MATCH");
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleLockFunds = async () => {
    setLoading(true);
    try {
      const amountWei = ethers.parseUnits(cashoutAmount.toString(), 6);
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
      const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);

      let currentNonce = await provider.getTransactionCount(wallet.address);

      console.log("Approving Escrow with nonce:", currentNonce);
      let tx = await usdc.approve(ESCROW_ADDRESS, amountWei, { nonce: currentNonce });
      await tx.wait();
      
      currentNonce++; // Increment for the next transaction

      console.log("Locking on Escrow with nonce:", currentNonce);
      const transferIdBytes = ethers.id(myOrderId);
      tx = await escrow.lockFunds(transferIdBytes, amountWei, { nonce: currentNonce });
      const receipt = await tx.wait();

      console.log("Notifying backend...", receipt.hash);
      const res = await fetch(`${API_BASE}/confirm-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_id: myOrderId, txHash: receipt.hash })
      });
      
      const backendData = await res.json();
      if (backendData.error) throw new Error(backendData.error);

      await fetchBalance(wallet);
      setMyOrderStatus("LOCKED");
    } catch (err) {
      console.error(err);
      alert("Failed to lock funds on-chain: " + (err.reason || err.message));
    }
    setLoading(false);
  };

  const handleAcceptOrder = async (order) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cashout/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_id: order.transfer_id, agent_wallet: wallet.address })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setActiveOrder(order.transfer_id);
      setActiveOrderDetails(order);
    } catch (err) {
      alert(err.message);
    }
    setLoading(false);
  };

  const handleAgentVerifyOtp = async () => {
    setLoading(true);
    setError("");
    try {
      // 1. Get Arbiter Signature
      const res = await fetch(`${API_BASE}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transfer_id: activeOrder,
          otp: agentOtpInput,
          agent_wallet: wallet.address
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      // 2. Claim Funds On-Chain
      const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);
      const transferIdBytes = ethers.id(activeOrder);
      
      const tx = await escrow.releaseFunds(
        transferIdBytes, 
        wallet.address, 
        data.amountWei, 
        data.deadline, 
        data.signature
      );
      await tx.wait();

      setAgentSuccess("Funds Claimed! USDC dropped into your wallet.");
      await fetchBalance(wallet);
    } catch (err) {
      setError(err.message);
      console.error(err);
    }
    setLoading(false);
  };

  const handleUploadSlip = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cashout/upload-slip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_id: activeOrder, agent_wallet: wallet.address, slip_url: slipBase64 })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      alert("Slip uploaded successfully! Waiting for user to confirm.");
    } catch (err) {
      alert("Upload failed: " + err.message);
    }
    setLoading(false);
  };

  const handleConfirmPayment = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cashout/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_id: myOrderId, sender_wallet: wallet.address })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      // Auto-settle the contract on behalf of the agent (User broadcasting it)
      const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);
      const transferIdBytes = ethers.id(myOrderId);
      
      const tx = await escrow.releaseFunds(
        transferIdBytes, 
        data.agent_wallet, 
        data.amountWei, 
        data.deadline, 
        data.signature
      );
      await tx.wait();

      setMyOrderStatus("OTP_VERIFIED");
      await fetchBalance(wallet);
      alert("Payment Confirmed and Crypto Released to Agent!");
    } catch (err) {
      alert("Confirmation failed: " + err.message);
    }
    setLoading(false);
  };

  const handleRecoverStuckFunds = async (transferId) => {
    setLoading(true);
    try {
      // 1. Artificially fast-forward the blockchain time by 30 mins
      await provider.send("evm_increaseTime", [30 * 60 + 1]);
      await provider.send("evm_mine", []);
      
      // 2. Call the smart contract refund mechanism
      const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);
      const tx = await escrow.refundExpired(ethers.id(transferId));
      await tx.wait();

      // 3. Mark as cancelled in backend so the alert disappears permanently
      await fetch(`${API_BASE}/cashout/cancel/${transferId}`, { method: "POST" });

      setStuckLocks(prev => prev.filter(t => t.transfer_id !== transferId));
      await fetchBalance(wallet);
      alert("Success! 30 minutes simulated and Escrow refunded your USDC.");
    } catch (err) {
      alert("Recovery failed: " + err.message);
      console.error(err);
    }
    setLoading(false);
  };

  const onFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSlipBase64(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!wallet) return <div className="app-container"><div className="glass-panel">Booting Web3 Wallet...</div></div>;

  return (
    <div className="app-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ color: 'white', margin: 0 }}>Aegis Web3 Wallet</h2>
        {activeTab !== "dashboard" && (
          <button onClick={() => { setActiveTab("dashboard"); fetchBalance(wallet); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer' }}>
            Back
          </button>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '25px', position: 'relative', overflow: 'hidden' }}>
        
        {/* ================= DASHBOARD ================= */}
        {activeTab === "dashboard" && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '5px' }}>Live Polygon Balance</p>
            <h1 style={{ fontSize: '3rem', margin: '0 0 25px 0', fontWeight: '700' }}>
              ${balance} <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.5)' }}>USDC</span>
            </h1>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
              <button className="btn-primary" onClick={() => setActiveTab("send")} style={{ flex: 1, backgroundColor: '#3b82f6' }}>Send</button>
              <button className="btn-primary" onClick={() => alert("Your Web3 Address: " + wallet.address)} style={{ flex: 1, backgroundColor: '#8b5cf6' }}>Receive</button>
            </div>

            <button className="btn-primary" onClick={() => setActiveTab("cashout")} style={{ width: '100%', marginBottom: '20px', padding: '15px', fontSize: '1.1rem' }}>
              Cash Out to Local Bank
            </button>

            {stuckLocks.length > 0 && (
              <div style={{ background: 'rgba(255,0,0,0.2)', border: '1px solid red', padding: '15px', borderRadius: '8px', marginBottom: '30px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#ff6b6b' }}>Lost Active Orders Found!</h4>
                <p style={{ fontSize: '0.8rem', marginBottom: '10px' }}>You have USDC locked in the escrow contract for orders that you navigated away from.</p>
                {stuckLocks.map(lock => (
                  <button key={lock.transfer_id} onClick={() => handleRecoverStuckFunds(lock.transfer_id)} className="btn-primary" style={{ backgroundColor: '#ef4444', fontSize: '0.8rem', padding: '8px', width: '100%', marginBottom: '5px' }}>
                    {loading ? "Reclaiming..." : `Recover ${lock.amount_usdc} USDC (Simulate 30 min wait)`}
                  </button>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'left' }}>
                <h4 style={{ margin: '0 0 5px 0' }}>Agent Mode</h4>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Provide liquidity & earn 1% yields</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={isAgent} onChange={(e) => setIsAgent(e.target.checked)} />
                <span className="slider round"></span>
              </label>
            </div>

            {isAgent && (
              <button className="btn-primary" onClick={() => setActiveTab("agent_hub")} style={{ width: '100%', marginTop: '15px', backgroundColor: '#10b981' }}>
                Open Agent Hub
              </button>
            )}
            
            <p style={{marginTop: '20px', fontSize: '0.7rem', color: 'gray'}}>Wallet: {wallet.address.slice(0,6)}...{wallet.address.slice(-4)}</p>
          </div>
        )}

        {/* ================= SEND CRYPTO ================= */}
        {activeTab === "send" && (
          <div>
            <h3 style={{ marginTop: 0 }}>Send Crypto (On-Chain)</h3>
            <form onSubmit={handleSendCrypto}>
              <div className="input-group">
                <label className="input-label">Wallet Address</label>
                <input type="text" className="input-field" value={sendAddress} onChange={e => setSendAddress(e.target.value)} placeholder="0x..." required />
              </div>
              <div className="input-group">
                <label className="input-label">Amount (USDC)</label>
                <input type="number" className="input-field" value={sendAmount} onChange={e => setSendAmount(e.target.value)} placeholder="50" required />
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Broadcasting Tx..." : "Send Instantly"}</button>
            </form>
          </div>
        )}

        {/* ================= CASH OUT (USER) ================= */}
        {activeTab === "cashout" && !myOrderId && (
          <div>
            <h3 style={{ marginTop: 0 }}>Cash Out</h3>
            <form onSubmit={handleRequestCashout}>
              <div className="input-group">
                <label className="input-label">Amount to Cash Out (USDC)</label>
                <input type="number" className="input-field" value={cashoutAmount} onChange={e => setCashoutAmount(e.target.value)} placeholder="50" required />
              </div>
              <div className="input-group">
                <label className="input-label">Payment Method / Bank Account</label>
                <input type="text" className="input-field" value={cashoutBankDetails} onChange={e => setCashoutBankDetails(e.target.value)} placeholder="e.g., KPay - 0912345678 (John)" required />
              </div>
              {cashoutAmount && (
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>You will receive approx:</p>
                  <h2 style={{ margin: '5px 0 0 0', color: '#10b981' }}>{(cashoutAmount * 3000).toLocaleString()} MMK</h2>
                </div>
              )}
              {error && <p className="error-message">{error}</p>}
              <button type="submit" className="btn-primary" disabled={loading || !cashoutAmount || !cashoutBankDetails}>{loading ? "Finding Agent..." : "Find an Agent Nearby"}</button>
            </form>
          </div>
        )}

        {activeTab === "cashout" && myOrderId && (
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Matchmaking Status</h3>
            
            {myOrderStatus === "PENDING_MATCH" && (
              <div style={{ padding: '30px 0' }}>
                <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 20px auto' }}></div>
                <p>Broadcasting to local agents...</p>
              </div>
            )}

            {myOrderStatus === "ACCEPTED" && (
              <div style={{ padding: '20px 0' }}>
                <div className="status-badge confirmed" style={{ marginBottom: '20px' }}>Agent Found!</div>
                <p style={{ fontSize: '0.9rem' }}>An agent is ready to fulfill your order. Please lock your USDC on the Smart Contract to begin the transaction.</p>
                <button className="btn-primary" onClick={handleLockFunds} disabled={loading}>{loading ? "Awaiting Block..." : "Lock USDC on-chain"}</button>
              </div>
            )}

            {(myOrderStatus === "LOCKED" || myOrderStatus === "SLIP_UPLOADED" || myOrderStatus === "OTP_VERIFIED") && (
              <div style={{ padding: '10px 0' }}>
                <div className="status-badge confirmed" style={{ marginBottom: '15px' }}>USDC Locked Securely</div>
                <p style={{ fontSize: '0.9rem' }}>The Agent is transferring Fiat to your account or preparing physical cash.</p>
                
                {myOrderStatus === "LOCKED" && (
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '12px', marginTop: '20px' }}>
                    <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', margin: '0 0 10px 0' }}>SHOW THIS QR TO THE AGENT</p>
                    <div style={{ background: 'white', padding: '15px', borderRadius: '8px', display: 'inline-block', marginBottom: '15px' }}>
                      <QRCode value={JSON.stringify({ transferId: myOrderId, otp: myOtp })} size={150} />
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>Or read OTP: {myOtp}</p>
                  </div>
                )}

                {myOrderStatus === "SLIP_UPLOADED" && (
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '12px', marginTop: '20px' }}>
                    <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', margin: '0 0 10px 0' }}>PAYMENT SLIP RECEIVED</p>
                    <img src={myOrderSlip} alt="Payment Slip" style={{ maxWidth: '100%', borderRadius: '8px', marginBottom: '15px' }} />
                    <p style={{ fontSize: '0.85rem' }}>Check your bank account. Did the money arrive?</p>
                    <button className="btn-primary" onClick={handleConfirmPayment} disabled={loading} style={{ backgroundColor: '#10b981', marginTop: '10px' }}>
                      {loading ? "Releasing..." : "Confirm Payment Received"}
                    </button>
                  </div>
                )}

                {myOrderStatus === "OTP_VERIFIED" && (
                   <div style={{ marginTop: '20px' }}>
                     <div className="success-icon" style={{ fontSize: '3rem', color: '#10b981', marginBottom: '15px' }}>✓</div>
                     <h3 style={{ margin: 0 }}>Transaction Complete</h3>
                   </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= AGENT HUB (NODE) ================= */}
        {activeTab === "agent_hub" && (
          <div>
            <h3 style={{ marginTop: 0, color: '#10b981' }}>Agent Hub</h3>
            
            {!activeOrder ? (
              <>
                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', marginBottom: '20px' }}>Radar scanning for local cashout requests...</p>
                {feed.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.4)' }}>
                    <p>No orders nearby right now.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {feed.map(order => (
                      <div key={order.transfer_id} style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span style={{ fontWeight: 'bold' }}>Sell {order.amount_usdc} USDC</span>
                          <span style={{ color: '#10b981' }}>Earn 1% Fee</span>
                        </div>
                        <p style={{ margin: '0 0 15px 0', fontSize: '0.85rem' }}>You pay: {order.amount_fiat.toLocaleString()} {order.currency}</p>
                        <button className="btn-primary" style={{ backgroundColor: '#10b981', padding: '8px' }} onClick={() => handleAcceptOrder(order)} disabled={loading}>
                          Accept Order
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center' }}>
                {!agentSuccess ? (
                  <>
                    <div className="status-badge confirmed" style={{ marginBottom: '15px' }}>Order Claimed</div>
                    <p style={{ fontSize: '0.9rem' }}>How are you fulfilling this order?</p>
                    
                    <div style={{ display: 'flex', gap: '10px', margin: '20px 0' }}>
                      <button className="btn-primary" style={{ flex: 1, backgroundColor: fulfillmentType === 'digital' ? '#3b82f6' : 'rgba(255,255,255,0.1)' }} onClick={() => setFulfillmentType('digital')}>Digital Wire</button>
                      <button className="btn-primary" style={{ flex: 1, backgroundColor: fulfillmentType === 'physical' ? '#8b5cf6' : 'rgba(255,255,255,0.1)' }} onClick={() => setFulfillmentType('physical')}>Physical Cash</button>
                    </div>

                    {fulfillmentType === 'digital' && (
                      <div style={{ textAlign: 'left', background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '8px' }}>
                        <p style={{ fontSize: '0.85rem', marginBottom: '10px' }}>
                          Send <strong>{(activeOrderDetails?.amount_fiat || 0).toLocaleString()} {activeOrderDetails?.currency}</strong> to:
                        </p>
                        <div style={{ background: 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                          <p style={{ margin: 0, fontFamily: 'monospace', color: '#10b981' }}>{activeOrderDetails?.bank_details || "No bank details provided"}</p>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', marginBottom: '10px' }}>Then upload the receipt slip below:</p>
                        <input type="file" accept="image/*" onChange={onFileChange} style={{ marginBottom: '15px', color: 'white' }} />
                        <button className="btn-primary" onClick={handleUploadSlip} disabled={loading || !slipBase64} style={{ backgroundColor: '#10b981' }}>
                          {loading ? "Uploading..." : "Upload Slip"}
                        </button>
                      </div>
                    )}

                    {fulfillmentType === 'physical' && (
                      <div style={{ textAlign: 'left', background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '8px' }}>
                        <p style={{ fontSize: '0.85rem', marginBottom: '10px' }}>Hand cash to user, then scan their QR code.</p>
                        
                        {!showQrScanner ? (
                          <button className="btn-primary" onClick={() => setShowQrScanner(true)} style={{ backgroundColor: '#10b981', marginBottom: '15px' }}>Open Scanner</button>
                        ) : (
                          <div style={{ marginBottom: '15px' }}>
                            <QrReader
                              onResult={(result, error) => {
                                if (result) {
                                  try {
                                    const parsed = JSON.parse(result?.text);
                                    if (parsed.otp) {
                                      setAgentOtpInput(parsed.otp);
                                      setShowQrScanner(false);
                                    }
                                  } catch(e) {}
                                }
                              }}
                              style={{ width: '100%' }}
                            />
                            <button className="btn-primary" onClick={() => setShowQrScanner(false)} style={{ backgroundColor: 'gray', marginTop: '10px' }}>Cancel Scan</button>
                          </div>
                        )}

                        <div className="input-group">
                          <label className="input-label">Or Manual OTP</label>
                          <input type="text" className="input-field" value={agentOtpInput} onChange={e => setAgentOtpInput(e.target.value)} placeholder="123456" maxLength={6} />
                        </div>
                        
                        {error && <p className="error-message">{error}</p>}
                        <button className="btn-primary" onClick={handleAgentVerifyOtp} disabled={loading || !agentOtpInput}>
                          {loading ? "Claiming on-chain..." : "Verify OTP & Claim USDC"}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="success-icon" style={{ fontSize: '3rem', color: '#10b981', marginBottom: '15px' }}>✓</div>
                    <h3 style={{ margin: '0 0 10px 0' }}>USDC Claimed!</h3>
                    <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>{agentSuccess}</p>
                    <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => { setActiveOrder(null); setAgentSuccess(""); setAgentOtpInput(""); }}>
                      Find Another Order
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Switch CSS */}
      <style dangerouslySetInnerHTML={{__html: `
        .switch { position: relative; display: inline-block; width: 40px; height: 22px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255,255,255,0.2); transition: .4s; }
        .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; }
        input:checked + .slider { background-color: #10b981; }
        input:checked + .slider:before { transform: translateX(18px); }
        .slider.round { border-radius: 22px; }
        .slider.round:before { border-radius: 50%; }
      `}} />
    </div>
  );
}
