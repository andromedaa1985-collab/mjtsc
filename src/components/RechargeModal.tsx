import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Coins, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { doc, increment, updateDoc } from 'firebase/firestore';

interface RechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TIERS = [
  { id: 'tier1', price: 9.9, credits: 100000, label: '基础包', popular: false },
  { id: 'tier2', price: 29.9, credits: 500000, label: '进阶包', popular: true },
  { id: 'tier3', price: 99.9, credits: 2000000, label: '专业包', popular: false },
];

export default function RechargeModal({ isOpen, onClose }: RechargeModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const handlePurchase = async (credits: number) => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    setIsProcessing(true);
    
    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        credits: increment(credits)
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Failed to add credits:", error);
      alert("充值失败，请重试");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/10 flex items-center justify-between bg-transparent">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">积分充值</h2>
                <p className="text-[10px] font-mono tracking-widest uppercase text-white/40 mt-1">购买积分以继续使用 AI 功能</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-colors border border-transparent hover:border-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-8 bg-black">
            {success ? (
              <div className="py-12 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2 tracking-tight">支付成功</h3>
                <p className="text-[10px] font-mono tracking-widest uppercase text-white/40">积分已添加到您的账户</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {TIERS.map((tier) => (
                  <div 
                    key={tier.id}
                    className={`relative flex flex-col p-6 rounded-xl border transition-all ${
                      tier.popular 
                        ? 'bg-white/5 border-white/30' 
                        : 'bg-transparent border-white/10 hover:border-white/20'
                    }`}
                  >
                    {tier.popular && (
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-white text-black rounded-full text-[8px] font-bold tracking-widest uppercase flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        最受欢迎
                      </div>
                    )}
                    
                    <div className="text-center mb-6">
                      <div className="text-[10px] font-mono tracking-widest uppercase text-white/40 mb-2">{tier.label}</div>
                      <div className="flex items-end justify-center gap-1">
                        <span className="text-sm text-white/40 font-medium mb-1">¥</span>
                        <span className="text-3xl font-bold text-white tracking-tight">{tier.price}</span>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center py-4 border-y border-white/10 mb-6">
                      <div className="flex items-center gap-2 text-white font-mono text-lg font-bold">
                        {tier.credits.toLocaleString()}
                      </div>
                      <div className="text-[10px] font-mono tracking-widest uppercase text-white/40 mt-1">积分</div>
                    </div>

                    <button
                      onClick={() => handlePurchase(tier.credits)}
                      disabled={isProcessing}
                      className={`w-full py-2.5 rounded-full font-bold transition-all flex items-center justify-center gap-2 text-[10px] tracking-widest uppercase ${
                        tier.popular
                          ? 'bg-white text-black hover:bg-white/90'
                          : 'bg-transparent border border-white/20 text-white hover:bg-white/10'
                      } disabled:opacity-50`}
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : '模拟支付'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
