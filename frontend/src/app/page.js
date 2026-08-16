"use client";
import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import QRCode from "react-qr-code";
import dynamic from 'next/dynamic';
import { PasskeyManager } from "../utils/PasskeyManager";

const QrReader = dynamic(() => import('react-qr-reader').then(mod => mod.QrReader), { ssr: false });

// --- CONTRACT CONFIG (Local Hardhat V3) ---
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
  "function depositStake(uint256 amount)",
  "function withdrawStake(uint256 amount)",
  "function lockFunds(bytes32 transferId, uint256 amount)",
  "function releaseFunds(bytes32 transferId, address settlerNode, uint256 settlerAmount, address feeTreasury, uint256 feeAmount, uint256 deadline, bytes signature)",
  "function refundExpired(bytes32 transferId)",
  "function slashAgent(bytes32 slashNonce, address badAgent, address recipient, uint256 payoutAmount, bytes signature)"
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

  // Passkey Authentication State
  const [hasPasskey, setHasPasskey] = useState(false);
  const [authError, setAuthError] = useState("");

  // Cash Out State
  const [cashoutAmount, setCashoutAmount] = useState("");
  const [cashoutBankDetails, setCashoutBankDetails] = useState("");
  const [myOrderId, setMyOrderId] = useState(null);
  const [myOrderStatus, setMyOrderStatus] = useState("");
  const [myOtp, setMyOtp] = useState("");
  const [myOrderSlip, setMyOrderSlip] = useState("");

  // Send Crypto State
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");

  // Agent State
  const [feed, setFeed] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [activeOrderDetails, setActiveOrderDetails] = useState(null);
  const [agentOtpInput, setAgentOtpInput] = useState("");
  const [agentSuccess, setAgentSuccess] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState("digital");
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [slipBase64, setSlipBase64] = useState("");

  // Slashing State
  const [stuckLocks, setStuckLocks] = useState([]);

  // Check for existing passkey on load
  useEffect(() => {
    if (PasskeyManager.isSupported()) {
      setHasPasskey(PasskeyManager.hasWallet());
    }
  }, []);

  const handleCreatePasskey = async () => {
    setLoading(true);
    setAuthError("");
    try {
      const pk = await PasskeyManager.createWallet();
      await initializeWallet(pk);
    } catch (err) {
      setAuthError("Biometric registration cancelled or failed.");
    }
    setLoading(false);
  };

  const handleUnlockPasskey = async () => {
    setLoading(true);
    setAuthError("");
    try {
      const pk = await PasskeyManager.unlockWallet();
      await initializeWallet(pk);
    } catch (err) {
      setAuthError("Biometric authentication failed.");
    }
    setLoading(false);
  };

  const initializeWallet = async (pk) => {
    const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
    setProvider(rpcProvider);
    const signer = new ethers.Wallet(pk, rpcProvider);
    setWallet(signer);
    
    // Auto-Fund from Hardhat for testing
    try {
      const ethBalance = await rpcProvider.getBalance(signer.address);
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, rpcProvider);
      const usdcBalance = await usdc.balanceOf(signer.address);
      
      if (ethBalance === 0n || usdcBalance === 0n) {
        const richSigner = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", rpcProvider);
        
        if (ethBalance === 0n) {
           let latestNonce = await rpcProvider.getTransactionCount(richSigner.address, "latest");
           const fundTx = await richSigner.sendTransaction({ to: signer.address, value: ethers.parseEther("1.0"), nonce: latestNonce });
           await fundTx.wait();
        }
        
        if (usdcBalance === 0n) {
           let latestNonce = await rpcProvider.getTransactionCount(richSigner.address, "latest");
           const usdcWithSigner = usdc.connect(richSigner);
           const mintTx = await usdcWithSigner.mint(signer.address, ethers.parseUnits("1000", 6), { nonce: latestNonce });
           await mintTx.wait();
        }
      }
      await fetchBalance(signer);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBalance = async (signer) => {
    if (!signer) return;
    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
    const bal = await usdc.balanceOf(signer.address);
    setBalance(ethers.formatUnits(bal, 6));
  };

  // Lock App (Hides dashboard, keeps wallet in storage)
  const handleLockApp = () => {
    setWallet(null);
  };

  // Delete Wallet (Permanently destroys the wallet)
  const handleDeleteWallet = () => {
    if (window.confirm("WARNING: This will permanently delete your wallet from this laptop. Continue?")) {
      PasskeyManager.logout();
      setWallet(null);
      setHasPasskey(false);
    }
  };

  // Poll for Feed & Statuses (abbreviated logic)
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
      
      const latestNonce = await provider.getTransactionCount(wallet.address, "latest");
      const tx = await usdc.transfer(sendAddress, amountWei, { nonce: latestNonce });
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

      let tx = await usdc.approve(ESCROW_ADDRESS, amountWei);
      await tx.wait();
      
      const latestNonce = await provider.getTransactionCount(wallet.address, "latest");
      const transferIdBytes = ethers.id(myOrderId);
      tx = await escrow.lockFunds(transferIdBytes, amountWei, { nonce: latestNonce });
      const receipt = await tx.wait();

      const res = await fetch(`${API_BASE}/confirm-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_id: myOrderId, txHash: receipt.hash })
      });
      
      await fetchBalance(wallet);
      setMyOrderStatus("LOCKED");
    } catch (err) {
      alert("Failed to lock funds on-chain");
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
      
      // Auto-settle the V3 contract with Fee Splits
      const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);
      const transferIdBytes = ethers.id(myOrderId);
      
      const tx = await escrow.releaseFunds(
        transferIdBytes, 
        data.agent_wallet, 
        data.settlerAmount,
        data.feeTreasury,
        data.feeAmount, 
        data.deadline, 
        data.signature
      );
      await tx.wait();

      setMyOrderStatus("OTP_VERIFIED");
      await fetchBalance(wallet);
    } catch (err) {
      alert("Confirmation failed: " + err.message);
    }
    setLoading(false);
  };

  const handleReportGhost = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cashout/report-ghost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_id: myOrderId, sender_wallet: wallet.address })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Execute Slashing Ticket on-chain
      const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);
      const tx = await escrow.slashAgent(
        data.slashNonce,
        data.badAgent,
        wallet.address,
        data.payoutAmount,
        data.signature
      );
      await tx.wait();

      setMyOrderStatus("CANCELLED");
      alert("Agent was slashed! 5 USDC penalty has been deposited to your wallet.");
      await fetchBalance(wallet);
    } catch (err) {
      alert("Failed to slash agent: " + err.message);
    }
    setLoading(false);
  }

  // --- RENDERING ---

  if (!wallet) {
    return (
      <div className="app-container">
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h2>Node App</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '30px' }}>Secure your funds using FaceID / TouchID.</p>
          
          <div style={{ padding: '20px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', marginBottom: '30px' }}>
            <span style={{ fontSize: '3rem' }}>🔐</span>
            <p style={{ fontSize: '0.85rem', marginTop: '10px' }}>No passwords. No seed phrases. Powered by Passkeys.</p>
          </div>

          {hasPasskey ? (
            <button className="btn-primary" onClick={handleUnlockPasskey} disabled={loading} style={{ backgroundColor: '#10b981', padding: '15px', fontSize: '1.2rem', width: '100%' }}>
              {loading ? "Waiting for Biometrics..." : "Unlock with FaceID / TouchID"}
            </button>
          ) : (
            <button className="btn-primary" onClick={handleCreatePasskey} disabled={loading} style={{ backgroundColor: '#3b82f6', padding: '15px', fontSize: '1.2rem', width: '100%' }}>
              {loading ? "Waiting for Biometrics..." : "Create Passkey Wallet"}
            </button>
          )}
          {authError && <p style={{ color: '#ff6b6b', marginTop: '15px' }}>{authError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ color: 'white', margin: 0 }}>Node Wallet</h2>
        {activeTab !== "dashboard" ? (
          <button onClick={() => { setActiveTab("dashboard"); fetchBalance(wallet); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer' }}>
            Back
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleLockApp} style={{ background: 'transparent', border: '1px solid #10b981', color: '#10b981', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer' }}>
              Lock App
            </button>
            <button onClick={handleDeleteWallet} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer' }}>
              Delete Wallet
            </button>
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '25px', position: 'relative', overflow: 'hidden' }}>
        
        {/* ================= DASHBOARD ================= */}
        {activeTab === "dashboard" && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '5px' }}>Live Balance</p>
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
            
            <p style={{marginTop: '20px', fontSize: '0.7rem', color: 'gray'}}>Passkey Wallet: {wallet.address.slice(0,6)}...{wallet.address.slice(-4)}</p>
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
                <input type="text" className="input-field" value={cashoutBankDetails} onChange={e => setCashoutBankDetails(e.target.value)} placeholder="e.g., KPay - 0912345678" required />
              </div>
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
                <button className="btn-primary" onClick={handleLockFunds} disabled={loading}>{loading ? "Awaiting Block..." : "Lock USDC on-chain"}</button>
                <button className="btn-primary" onClick={handleReportGhost} style={{ backgroundColor: '#ef4444', marginTop: '10px' }}>Agent is taking too long (Report)</button>
              </div>
            )}

            {myOrderStatus === "LOCKED" && (
              <div style={{ padding: '10px 0' }}>
                <div className="status-badge confirmed" style={{ marginBottom: '15px' }}>USDC Locked Securely</div>
                <p style={{ fontSize: '0.9rem' }}>The Agent is transferring Fiat to your account or preparing physical cash.</p>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '12px', marginTop: '20px' }}>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', margin: '0 0 10px 0' }}>SHOW THIS QR TO THE AGENT</p>
                  <div style={{ background: 'white', padding: '15px', borderRadius: '8px', display: 'inline-block', marginBottom: '15px' }}>
                    <QRCode value={JSON.stringify({ transferId: myOrderId, otp: myOtp })} size={150} />
                  </div>
                  <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>Or read OTP: {myOtp}</p>
                </div>
                <button className="btn-primary" onClick={handleReportGhost} style={{ backgroundColor: '#ef4444', marginTop: '10px' }}>Report Agent & Claim 5 USDC Penalty</button>
              </div>
            )}

            {myOrderStatus === "SLIP_UPLOADED" && (
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '12px', marginTop: '20px' }}>
                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', margin: '0 0 10px 0' }}>PAYMENT SLIP RECEIVED</p>
                <img src={myOrderSlip} alt="Payment Slip" style={{ maxWidth: '100%', borderRadius: '8px', marginBottom: '15px' }} />
                <button className="btn-primary" onClick={handleConfirmPayment} disabled={loading} style={{ backgroundColor: '#10b981', marginTop: '10px' }}>
                  {loading ? "Releasing..." : "Confirm Payment Received"}
                </button>
              </div>
            )}

            {myOrderStatus === "CANCELLED" && (
              <div style={{ marginTop: '20px' }}>
                <h3 style={{ margin: 0, color: '#ef4444' }}>Transaction Cancelled</h3>
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
                <p>Order functionality abbreviated for Agent Hub in V3 Sandbox.</p>
              </div>
            )}
          </div>
        )}

      </div>

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
