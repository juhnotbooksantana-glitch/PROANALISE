/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Zap, 
  History, 
  Activity, 
  Crosshair, 
  ShieldCheck, 
  AlertTriangle,
  RotateCcw,
  BarChart3,
  Dna,
  Link,
  Split,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { 
  analyzePatterns, 
  TERMINAL_GROUPS, 
  getNeighbors, 
  WHEEL_ORDER,
  WHEEL_REGIONS,
  EmpiricalBias
} from './lib/rouletteModel';
import { STRATEGY_DESCRIPTIONS } from './constants';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  limit, 
  orderBy,
  Timestamp,
  doc,
  getDoc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { 
  CheckCircle2, 
  XCircle,
  LogIn,
  User as UserIcon,
  TrendingUp,
  BrainCircuit,
  Settings,
  Database,
  PieChart,
  Users,
  Plus,
  Trash2,
  UserPlus,
  MessageSquare,
  Sparkles
} from 'lucide-react';
import { getQuantumAdvice } from './services/geminiService';
import { standaloneStorage } from './lib/standaloneStorage';

const ADMIN_EMAIL = 'juhnotbooksantana@gmail.com';
const IS_STANDALONE = true; // Use standalone mode since Firebase was declined

export default function App() {
  const [input, setInput] = useState<string>('');
  const [history, setHistory] = useState<number[]>([]);
  const [bias, setBias] = useState<EmpiricalBias>({ strategySuccess: {}, terminalSuccess: {} });
  const [analysis, setAnalysis] = useState(analyzePatterns([], bias));
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasRunAnalysis, setHasRunAnalysis] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'operator' | 'analyst' | 'viewer' | 'admin' | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<null | 'pending' | 'submitting' | 'submitted'>(null);
  const [pendingOutcome, setPendingOutcome] = useState<'win' | 'loss' | null>(null);
  const [justification, setJustification] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [authorizedUsers, setAuthorizedUsers] = useState<any[]>([]);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [newAuthEmail, setNewAuthEmail] = useState('');
  const [newAuthRole, setNewAuthRole] = useState<'operator' | 'analyst' | 'viewer'>('operator');
  const [newAuthStatus, setNewAuthStatus] = useState<'active' | 'suspended'>('active');
  const [newAuthExpires, setNewAuthExpires] = useState('');
  
  // AI Assistant State
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  
  // Repetition (Gale) Tracking
  const [activeSignal, setActiveSignal] = useState<{ terminal: number; strategy: string; step: number; startHistoryLength: number } | null>(null);

  // Auth & Bias Sync
  useEffect(() => {
    if (IS_STANDALONE) {
      // Mock login for standalone mode
      const mockUser = {
        uid: 'standalone-user',
        email: ADMIN_EMAIL,
        displayName: 'Operador Local',
        photoURL: null
      } as any;
      
      setUser(mockUser);
      setUserRole('admin');
      fetchBias(mockUser.uid);
      fetchGlobalStats();
      fetchAuthorizedEmails();
      setIsCheckingAuth(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (u) => {
      setIsCheckingAuth(true);
      if (u) {
        // Se for admin, pula verificação de whitelist para si mesmo (já garantido por regras)
        if (u.email === ADMIN_EMAIL) {
          setUser(u);
          setUserRole('admin');
          fetchBias(u.uid);
          fetchGlobalStats();
          fetchAuthorizedEmails();
          setIsCheckingAuth(false);
          return;
        }

        // Verifica se usuário está na whitelist
        const docRef = doc(db, 'authorized_users', u.email!);
        let docSnap;
        try {
          docSnap = await getDoc(docRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `authorized_users/${u.email}`);
          return;
        }

        if (docSnap.exists()) {
          const data = docSnap.data();
          const isExpired = data.expiresAt && data.expiresAt.toDate() < new Date();
          
          if (data.status === 'active' && !isExpired) {
            setUser(u);
            setUserRole(data.role || 'operator');
            fetchBias(u.uid);
            setIsCheckingAuth(false);
          } else {
            setError(isExpired ? "Acesso expirado." : "Acesso suspenso pelo administrador.");
            setUser(null);
            await auth.signOut();
            setIsCheckingAuth(false);
          }
        } else {
          // Não autorizado
          setError("Acesso negado: Seu e-mail não está na lista de autorizados.");
          setUser(null);
          await auth.signOut();
          setIsCheckingAuth(false);
        }
      } else {
        setUser(null);
        setUserRole(null);
        setIsCheckingAuth(false);
      }
    });
    return unsub;
  }, []);

  const fetchAuthorizedEmails = async () => {
    if (IS_STANDALONE) {
      setAuthorizedUsers(standaloneStorage.getAuthorizedUsers());
      return;
    }
    try {
      const snapshot = await getDocs(collection(db, 'authorized_users'));
      setAuthorizedUsers(snapshot.docs.map(d => ({ email: d.id, ...d.data() })));
    } catch (err) {
      console.error("Fetch auth emails error:", err);
      handleFirestoreError(err, OperationType.LIST, 'authorized_users');
    }
  };

  const addAuthorizedUser = async () => {
    if (!newAuthEmail || !newAuthEmail.includes('@')) return;
    if (IS_STANDALONE) {
      standaloneStorage.addAuthorizedUser({
        email: newAuthEmail.trim().toLowerCase(),
        role: newAuthRole,
        status: newAuthStatus,
        expiresAt: newAuthExpires ? { toDate: () => new Date(newAuthExpires) } : null,
        addedAt: { toDate: () => new Date() },
        addedBy: user?.email
      });
      setNewAuthEmail('');
      setNewAuthExpires('');
      fetchAuthorizedEmails();
      return;
    }
    try {
      const path = `authorized_users/${newAuthEmail.trim().toLowerCase()}`;
      await setDoc(doc(db, 'authorized_users', newAuthEmail.trim().toLowerCase()), {
        role: newAuthRole,
        status: newAuthStatus,
        expiresAt: newAuthExpires ? Timestamp.fromDate(new Date(newAuthExpires)) : null,
        addedAt: Timestamp.now(),
        addedBy: user?.email
      });
      setNewAuthEmail('');
      setNewAuthExpires('');
      fetchAuthorizedEmails();
    } catch (err) {
      setError("Erro ao autorizar e-mail.");
      handleFirestoreError(err, OperationType.WRITE, 'authorized_users');
    }
  };

  const removeAuthorizedUser = async (email: string) => {
    if (IS_STANDALONE) {
      standaloneStorage.removeAuthorizedUser(email);
      fetchAuthorizedEmails();
      return;
    }
    try {
      await deleteDoc(doc(db, 'authorized_users', email));
      fetchAuthorizedEmails();
    } catch (err) {
      setError("Erro ao remover autorização.");
      handleFirestoreError(err, OperationType.DELETE, `authorized_users/${email}`);
    }
  };

  const fetchBias = async (uid: string) => {
    if (IS_STANDALONE) {
      const docs = standaloneStorage.getFeedbacks(uid);
      const strategies: Record<string, { wins: number; total: number }> = {};
      docs.forEach((doc: any) => {
        const s = doc.triggeredStrategy;
        if (!s) return;
        if (!strategies[s]) strategies[s] = { wins: 0, total: 0 };
        strategies[s].total++;
        if (doc.outcome === 'win') strategies[s].wins++;
      });

      const newBias: EmpiricalBias = { strategySuccess: {}, terminalSuccess: {} };
      Object.entries(strategies).forEach(([name, data]) => {
        newBias.strategySuccess[name] = data.wins / data.total;
      });
      setBias(newBias);
      return;
    }
    try {
      const q = query(
        collection(db, 'feedbacks'),
        where('userId', '==', uid),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => d.data());
      
      const strategies: Record<string, { wins: number; total: number }> = {};
      docs.forEach(doc => {
        const s = doc.triggeredStrategy;
        if (!s) return;
        if (!strategies[s]) strategies[s] = { wins: 0, total: 0 };
        strategies[s].total++;
        if (doc.outcome === 'win') strategies[s].wins++;
      });

      const newBias: EmpiricalBias = {
        strategySuccess: {},
        terminalSuccess: {}
      };

      Object.entries(strategies).forEach(([name, data]) => {
        newBias.strategySuccess[name] = data.wins / data.total;
      });

      setBias(newBias);
    } catch (err) {
      console.error("Error fetching bias:", err);
      handleFirestoreError(err, OperationType.LIST, 'feedbacks');
    }
  };

  const fetchGlobalStats = async () => {
    if (IS_STANDALONE) {
      const docs = standaloneStorage.getFeedbacks();
      const stats: any = {
        total: docs.length,
        wins: docs.filter((d: any) => d.outcome === 'win').length,
        strategies: {},
        recent: docs
      };
      docs.forEach((d: any) => {
        if (!d.triggeredStrategy) return;
        if (!stats.strategies[d.triggeredStrategy]) stats.strategies[d.triggeredStrategy] = { wins: 0, total: 0 };
        stats.strategies[d.triggeredStrategy].total++;
        if (d.outcome === 'win') stats.strategies[d.triggeredStrategy].wins++;
      });
      setGlobalStats(stats);
      return;
    }
    try {
      const q = query(collection(db, 'feedbacks'), orderBy('timestamp', 'desc'), limit(100));
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const stats: any = {
        total: docs.length,
        wins: docs.filter((d: any) => d.outcome === 'win').length,
        strategies: {},
        recent: docs
      };

      docs.forEach((d: any) => {
        if (!d.triggeredStrategy) return;
        if (!stats.strategies[d.triggeredStrategy]) stats.strategies[d.triggeredStrategy] = { wins: 0, total: 0 };
        stats.strategies[d.triggeredStrategy].total++;
        if (d.outcome === 'win') stats.strategies[d.triggeredStrategy].wins++;
      });

      setGlobalStats(stats);
    } catch (err) {
      console.error("Admin fetch error:", err);
      handleFirestoreError(err, OperationType.LIST, 'feedbacks');
    }
  };
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError("Falha na autenticação Google.");
    }
  };

  const submitFeedback = async () => {
    if (!user || !analysis.suggestedTerminal || !pendingOutcome) return;
    setFeedbackStatus('submitting');

    if (IS_STANDALONE) {
      standaloneStorage.addFeedback({
        userId: user.uid,
        history,
        suggestedTerminal: analysis.suggestedTerminal,
        triggeredStrategy: analysis.triggeredStrategy || null,
        outcome: pendingOutcome,
        justification: justification.trim() || null,
        probabilities: analysis.probabilities
      });
      setFeedbackStatus('submitted');
      setPendingOutcome(null);
      setJustification('');
      fetchBias(user.uid);
      if (showAdmin) fetchGlobalStats();
      return;
    }

    try {
      await addDoc(collection(db, 'feedbacks'), {
        userId: user.uid,
        history,
        suggestedTerminal: analysis.suggestedTerminal,
        triggeredStrategy: analysis.triggeredStrategy || null,
        outcome: pendingOutcome,
        justification: justification.trim() || null,
        timestamp: Timestamp.now(),
        probabilities: analysis.probabilities
      });
      setFeedbackStatus('submitted');
      setPendingOutcome(null);
      setJustification('');
      fetchBias(user.uid);
    } catch (err) {
      setError("Erro ao salvar feedback.");
      setFeedbackStatus(null);
      handleFirestoreError(err, OperationType.CREATE, 'feedbacks');
    }
  };

  const chartData = useMemo(() => {
    return Object.entries(analysis.probabilities)
      .map(([terminal, prob]) => ({
        name: `TERM ${terminal}`,
        prob: prob as number,
        id: parseInt(terminal)
      }))
      .sort((a, b) => b.prob - a.prob);
  }, [analysis.probabilities]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    setError(null);
    
    if (!val.trim()) {
      setHistory([]);
      setHasRunAnalysis(false);
      setActiveSignal(null);
      return;
    }

    const parts = val.split(',').map(p => p.trim());
    const validNumbers: number[] = [];
    let hasError = false;

    for (const part of parts) {
      if (part === '') continue;
      
      const num = Number(part);
      if (isNaN(num)) {
        setError(`"${part}" não é um número válido.`);
        hasError = true;
        break;
      }
      
      if (num < 0 || num > 36) {
        setError(`O número ${num} está fora do intervalo (0-36).`);
        hasError = true;
        break;
      }
      
      validNumbers.push(num);
    }
    
    if (!hasError) {
      const newHistory = validNumbers;
      setHistory(newHistory); 
      setFeedbackStatus(null);

      // Gale Progression Logic
      if (activeSignal) {
        const lastNum = newHistory[newHistory.length - 1];
        const lastTerminal = lastNum % 10;
        const totalNumbersEnteredSinceSignal = newHistory.length - activeSignal.startHistoryLength;

        // If a new number was added
        if (totalNumbersEnteredSinceSignal > 0) {
          if (lastTerminal === activeSignal.terminal) {
            // HIT! (Win)
            setPendingOutcome('win');
            setActiveSignal(null);
          } else if (totalNumbersEnteredSinceSignal >= 3) {
            // Missed on Entrada, Gale 1 and Gale 2
            setPendingOutcome('loss');
            setActiveSignal(null);
          } else {
            // Move to next step (Gale)
            setActiveSignal(prev => prev ? { ...prev, step: totalNumbersEnteredSinceSignal } : null);
          }
        }
      } else {
        setHasRunAnalysis(false);
      }
    }
  };

  const triggerAnalysis = () => {
    if (history.length < 7) {
      setError("Insira ao menos 7 números para processar.");
      return;
    }
    setIsAnalyzing(true);
    setTimeout(() => {
      const result = analyzePatterns(history.slice(-7), bias);
      setAnalysis(result);
      setIsAnalyzing(false);
      setHasRunAnalysis(true);
      setFeedbackStatus(null);
      
      if (result.suggestedTerminal !== null) {
        setActiveSignal({
          terminal: result.suggestedTerminal,
          strategy: result.triggeredStrategy || 'Padrão Identificado',
          step: 0,
          startHistoryLength: history.length
        });
      }
    }, 1200);
  };

  const clearHistory = () => {
    setInput('');
    setHistory([]);
    setError(null);
    setHasRunAnalysis(false);
    setAnalysis(analyzePatterns([]));
    setAiAdvice(null);
  };

  const fetchAiAdvice = async () => {
    if (history.length < 5) return;
    setIsAiLoading(true);
    try {
      const advice = await getQuantumAdvice(
        history.slice(-10), 
        hasRunAnalysis ? analysis.suggestedTerminal : null,
        hasRunAnalysis ? analysis.triggeredStrategy : null
      );
      setAiAdvice(advice);
    } finally {
      setIsAiLoading(false);
    }
  };

  const currentSignal = hasRunAnalysis ? analysis.suggestedTerminal : null;
  const isHighProb = currentSignal !== null;

  useEffect(() => {
    if (hasRunAnalysis && isHighProb) {
      fetchAiAdvice();
    }
  }, [hasRunAnalysis, currentSignal]);

  const getNumberColor = (num: number) => {
    if (num === 0) return 'bg-[#008000]';
    const reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    return reds.includes(num) ? 'bg-brand-red' : 'bg-zinc-900';
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-center p-6">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="mb-6"
        >
          <Activity className="text-brand-yellow" size={48} />
        </motion.div>
        <h2 className="text-xl font-black text-white tracking-widest uppercase mb-2">Verificando Protocolos</h2>
        <p className="text-[10px] text-gray-500 font-mono animate-pulse tracking-[0.2em]">AUTENTICANDO CREDENCIAIS NO CORTEX...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Top Status Bar */}
      <header className="flex justify-between items-center glass-panel px-6 py-3 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-yellow flex items-center justify-center text-black font-black italic">Q</div>
          <div>
            <h1 className="text-sm font-black text-white tracking-widest uppercase">QUANTUM ZEUZ PRO</h1>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-green shadow-[0_0_5px_#00FF41]" />
              <span className="text-[9px] text-gray-500 font-mono tracking-widest">LIVE DATA SYNC ACTIVE</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
           {user?.email === ADMIN_EMAIL && (
             <button 
               onClick={() => {
                 setShowAdmin(!showAdmin);
                 if (!showAdmin) fetchGlobalStats();
               }} 
               className={`h-8 px-3 rounded-lg transition-all text-[10px] font-black flex items-center gap-2 ${showAdmin ? 'bg-brand-yellow text-black' : 'glass-panel text-brand-yellow'}`}
             >
               <Settings size={12} /> {showAdmin ? 'VOLTAR AO TERMINAL' : 'PAINEL ADMIN'}
             </button>
           )}
           {user ? (
             <div className="flex items-center gap-3 glass-panel px-3 rounded-lg border border-white/5">
                <div className="flex flex-col items-end">
                   <span className="text-[8px] font-black text-gray-500 uppercase leading-none">Agente Ativo</span>
                   <span className="text-[10px] font-bold text-white leading-none mt-1">{user.displayName?.split(' ')[0]}</span>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-6 h-6 rounded-md opacity-80" alt="Avatar" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center"><UserIcon size={12} /></div>
                )}
             </div>
           ) : (
             <button onClick={handleLogin} className="h-8 px-3 bg-white text-black rounded-lg hover:bg-brand-yellow transition-all text-[10px] font-black flex items-center gap-2">
               <LogIn size={12} /> ENTRAR
             </button>
           )}
           <button onClick={clearHistory} className="h-8 px-3 glass-panel rounded-lg hover:text-brand-red transition-all text-[10px] font-bold">
             LIMPAR DADOS
           </button>
           <button 
             onClick={() => setShowAiChat(!showAiChat)} 
             className={`h-8 px-3 rounded-lg transition-all text-[10px] font-black flex items-center gap-2 ${showAiChat ? 'bg-purple-600 text-white' : 'glass-panel text-purple-400'}`}
           >
             <Sparkles size={12} /> {showAiChat ? 'OCULTAR IA' : 'IA CORTEX'}
           </button>
        </div>
      </header>

      {showAdmin && globalStats ? (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
           {/* Summary Stats */}
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="glass-panel p-6 rounded-3xl border-l-4 border-brand-yellow">
                 <div className="flex items-center gap-3 mb-2 opacity-50"><Database size={16}/> <span className="text-[10px] font-black uppercase tracking-widest">Amostras Globais</span></div>
                 <div className="text-3xl font-black">{globalStats.total} <span className="text-xs text-gray-500 italic">LOGS</span></div>
              </div>
              <div className="glass-panel p-6 rounded-3xl border-l-4 border-brand-green">
                 <div className="flex items-center gap-3 mb-2 opacity-50"><PieChart size={16}/> <span className="text-[10px] font-black uppercase tracking-widest">Assertividade</span></div>
                 <div className="text-3xl font-black text-brand-green">{Math.round((globalStats.wins / (globalStats.total || 1)) * 100)}%</div>
              </div>
              <div className="glass-panel p-6 rounded-3xl border-l-4 border-blue-500">
                 <div className="flex items-center gap-3 mb-2 opacity-50"><Users size={16}/> <span className="text-[10px] font-black uppercase tracking-widest">Operadores</span></div>
                 <div className="text-3xl font-black">SYNC</div>
              </div>
              <div className="glass-panel p-6 rounded-3xl border-l-4 border-purple-500">
                 <div className="flex items-center gap-3 mb-2 opacity-50"><BrainCircuit size={16}/> <span className="text-[10px] font-black uppercase tracking-widest">Cortex v4.0</span></div>
                 <div className="text-3xl font-black text-purple-500">HEAT</div>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
               {/* Algorithm Efficiency */}
               <section className="glass-panel p-8 rounded-3xl">
                  <h3 className="text-[10px] font-black text-brand-yellow uppercase tracking-widest mb-6">Eficiência por Vertente Algorítmica</h3>
                  <div className="space-y-5">
                     {Object.entries(globalStats.strategies).length === 0 && <p className="text-gray-700 font-mono text-[10px] text-center py-10 italic">Nenhum dado estático processado ainda.</p>}
                     {Object.entries(globalStats.strategies).map(([name, data]: [string, any]) => (
                       <div key={name} className="space-y-2">
                          <div className="flex justify-between text-[10px] font-black uppercase font-mono">
                             <span className="text-white/60 truncate max-w-[300px]">{name}</span>
                             <span className="text-brand-green">{Math.round((data.wins / data.total) * 100)}% <span className="text-gray-600 font-normal">({data.total} entradas)</span></span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden flex">
                             <div className="h-full bg-brand-yellow shadow-[0_0_10px_#FFDD00]" style={{ width: `${(data.wins / data.total) * 100}%` }} />
                          </div>
                       </div>
                     ))}
                  </div>
               </section>

               {/* Signal Audit */}
               <section className="glass-panel p-8 rounded-3xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-10 opacity-[0.02] pointer-events-none">
                     <Database size={200} />
                  </div>
                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6">Auditoria de Sinais (Top 100)</h3>
                  <div className="space-y-4 h-[350px] overflow-y-auto custom-scrollbar pr-4 text-[10px] font-mono">
                     {globalStats.recent.map((log: any) => (
                       <div key={log.id} className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-2">
                         <div className="flex justify-between items-center">
                           <span className={`${log.outcome === 'win' ? 'text-brand-green' : 'text-brand-red'} font-black uppercase text-[8px]`}>
                             {log.outcome === 'win' ? '● ACERTO' : '○ ERRO'}
                           </span>
                           <span className="text-gray-600 text-[8px] italic">{new Date(log.timestamp?.toDate()).toLocaleTimeString()}</span>
                         </div>
                         <div className="text-gray-400 leading-tight">
                           <span className="text-white/60">{log.triggeredStrategy}</span>
                           {log.justification && (
                             <p className="mt-1 text-brand-yellow/80 italic">" {log.justification} "</p>
                           )}
                         </div>
                       </div>
                     ))}
                     {globalStats.recent.length === 0 && <p className="text-center py-10 opacity-20">Sem registros para auditoria.</p>}
                  </div>
               </section>
           </div>

           {/* User Whitelist Management */}
           <section className="glass-panel p-8 rounded-3xl">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left: Explanation */}
                <div className="lg:col-span-4 space-y-6">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                       <ShieldCheck size={18} className="text-brand-yellow" /> Guia de Permissões
                    </h3>
                    <div className="space-y-4">
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <div className="text-[9px] font-black text-brand-yellow uppercase tracking-widest mb-1">Analista / Operador</div>
                        <p className="text-[10px] text-gray-400 font-mono leading-relaxed">Permite enviar feedbacks de acerto/erro, alimentando o algoritmo de tendência e ajustes de viés.</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <div className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Visualizador</div>
                        <p className="text-[10px] text-gray-400 font-mono leading-relaxed">Apenas leitura. Pode ver os sinais em tempo real, mas não possui permissão para gravar resultados.</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <div className="text-[9px] font-black text-brand-red uppercase tracking-widest mb-1">Suspenso</div>
                        <p className="text-[10px] text-gray-400 font-mono leading-relaxed">Bloqueio instantâneo de acesso ao sistema, mesmo que o e-mail esteja logado.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Management */}
                <div className="lg:col-span-8">
                  <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 mb-8 pb-8 border-b border-white/5">
                    <div className="flex-1">
                      <h3 className="text-[10px] font-black text-brand-yellow uppercase tracking-widest mb-1 flex items-center gap-2">
                        <UserPlus size={14} /> Controle de Acesso Granular
                      </h3>
                      <p className="text-xs text-gray-400 font-mono italic">Adicione operadores externos definindo validade e papel.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-[2]">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-600 uppercase ml-1">E-mail do Operador</label>
                      <input 
                        type="email"
                        value={newAuthEmail}
                        onChange={(e) => setNewAuthEmail(e.target.value)}
                        placeholder="operador@email.com"
                        className="h-10 w-full px-4 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-brand-yellow transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-600 uppercase ml-1">Permissão</label>
                      <select 
                        value={newAuthRole}
                        onChange={(e: any) => setNewAuthRole(e.target.value)}
                        className="h-10 w-full px-3 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-brand-yellow transition-all appearance-none"
                      >
                        <option value="operator" className="bg-zinc-900">Operador</option>
                        <option value="analyst" className="bg-zinc-900">Analista</option>
                        <option value="viewer" className="bg-zinc-900">Visualizador</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-600 uppercase ml-1">Expiração (Opcional)</label>
                      <input 
                        type="date"
                        value={newAuthExpires}
                        onChange={(e) => setNewAuthExpires(e.target.value)}
                        className="h-10 w-full px-4 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-brand-yellow transition-all [color-scheme:dark]"
                      />
                    </div>
                    <div className="flex items-end">
                      <button 
                        onClick={addAuthorizedUser}
                        className="h-10 w-full bg-brand-yellow text-black rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg"
                      >
                        <Plus size={16} /> AUTORIZAR
                      </button>
                    </div>
                  </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {authorizedUsers.length === 0 && (
                      <p className="col-span-full text-center py-8 text-[10px] font-mono text-gray-600 italic">Nenhum operador externo configurado.</p>
                    )}
                    {authorizedUsers.map(u => (
                      <div key={u.email} className={`bg-white/5 p-4 rounded-2xl flex flex-col gap-4 group hover:bg-white/10 transition-all border ${u.status === 'suspended' ? 'border-brand-red/20 opacity-60' : 'border-white/5'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${u.status === 'active' ? 'bg-zinc-800 text-white/50' : 'bg-brand-red/10 text-brand-red'}`}>
                              <UserIcon size={14} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[11px] font-mono font-bold text-gray-300">{u.email}</span>
                              <span className="text-[7px] font-black text-gray-500 uppercase tracking-widest leading-none mt-1">Adicionado em {new Date(u.addedAt?.toDate()).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => removeAuthorizedUser(u.email)}
                            className="p-2 text-gray-600 hover:text-brand-red opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                          <span className="text-[8px] font-black px-2 py-0.5 rounded bg-white/10 text-white/60 uppercase tracking-widest">{u.role}</span>
                          <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${u.status === 'active' ? 'bg-brand-green/10 text-brand-green' : 'bg-brand-red/10 text-brand-red'}`}>{u.status}</span>
                          {u.expiresAt && (
                            <span className="text-[8px] font-black text-gray-500 font-mono ml-auto">EXP: {new Date(u.expiresAt.toDate()).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
           </section>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className={`${showAiChat ? 'lg:col-span-12 xl:col-span-8' : 'lg:col-span-12 xl:col-span-8'} space-y-4`}>
             <AnimatePresence mode="wait">
               {isAnalyzing ? (
                 <motion.section
                   key="analyzing"
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   exit={{ opacity: 0 }}
                   className="glass-panel p-12 rounded-3xl flex flex-col items-center justify-center text-center overflow-hidden relative"
                 >
                   <motion.div 
                     animate={{ rotate: 360 }}
                     transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                     className="mb-4"
                   >
                     <Activity className="text-brand-yellow" size={40} />
                   </motion.div>
                   <h2 className="text-xl font-black text-white tracking-widest uppercase mb-1">Processando Padrões</h2>
                   <p className="text-[10px] text-gray-500 font-mono animate-pulse">TRIANGULANDO SETORES E MAPEANDO TERMINAIS...</p>
                   <div className="absolute bottom-0 left-0 h-1 bg-brand-yellow overflow-hidden w-full">
                     <motion.div 
                       initial={{ x: "-100%" }}
                       animate={{ x: "100%" }}
                       transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                       className="h-full w-1/3 bg-white/20"
                     />
                   </div>
                 </motion.section>
               ) : isHighProb ? (
                 <motion.section
                   key={`signal-${currentSignal}`}
                   initial={{ opacity: 0, scale: 0.95 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.95 }}
                   transition={{ duration: 0.4, ease: "easeOut" }}
                   className="bg-brand-yellow p-6 rounded-3xl text-black relative overflow-hidden shadow-[0_0_40px_rgba(255,221,0,0.2)]"
                 >
                       <div className="flex flex-col md:flex-row items-start justify-between gap-8 relative z-10">
                     <div className="flex-1 space-y-6">
                       <div className="text-center md:text-left">
                         <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-4">
                           <div className="inline-flex items-center gap-2 bg-black/80 text-brand-yellow px-3 py-1 rounded-full text-[10px] font-black tracking-tighter">
                             <Zap size={12} fill="currentColor" /> ALTA PROBABILIDADE ({Math.round(analysis.probabilities[currentSignal] as number)}%)
                           </div>
                           {activeSignal && (
                             <div className="inline-flex items-center gap-2 bg-white/20 text-black px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-black/5 animate-pulse">
                               {activeSignal.step === 0 ? 'Entrada Inicial' : `Gale ${activeSignal.step}`}
                             </div>
                           )}
                         </div>
                         <h2 className="text-7xl font-black tracking-tighter leading-none mb-1 text-black">
                           TERM <span className="underline decoration-black decoration-8 underline-offset-4">{currentSignal}</span>
                         </h2>
                         {analysis.triggeredStrategy && (
                           <div className="relative group mt-2 inline-block">
                             <p className="text-black font-black text-[10px] uppercase bg-black/10 px-2 py-0.5 rounded flex items-center gap-2 cursor-help transition-all hover:bg-black/20">
                               Estratégia: {analysis.triggeredStrategy}
                               <Info size={12} className="opacity-40" />
                             </p>
                             
                             <div className="absolute bottom-full left-0 mb-3 w-72 p-0 bg-black text-white rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 border border-white/10 translate-y-2 group-hover:translate-y-0 scale-95 group-hover:scale-100 origin-bottom-left">
                               <div className="p-4 space-y-3">
                                 <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                                   <div className="w-8 h-8 rounded-lg bg-brand-yellow flex items-center justify-center text-black">
                                     <BrainCircuit size={16} />
                                   </div>
                                   <div>
                                     <p className="text-brand-yellow font-black text-[10px] uppercase tracking-tighter leading-tight">Lógica da Operação</p>
                                     <p className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">{analysis.triggeredStrategy.split(' (')[0]}</p>
                                   </div>
                                 </div>
                                 <p className="text-[10px] font-mono leading-relaxed text-gray-300">
                                   {(() => {
                                     const baseStrategy = analysis.triggeredStrategy.split(' (')[0];
                                     return STRATEGY_DESCRIPTIONS[analysis.triggeredStrategy] || 
                                            STRATEGY_DESCRIPTIONS[baseStrategy] || 
                                            "Padrão detectado através da análise de fluxo terminal e vizinhos de pista.";
                                   })()}
                                 </p>
                                 <div className="pt-2 flex items-center gap-2">
                                    <div className="h-px bg-white/10 flex-1" />
                                    <span className="text-[8px] font-black text-gray-700 uppercase tracking-[0.2em]">Cortex Engine v4.0</span>
                                 </div>
                               </div>
                               <div className="absolute top-full left-4 w-3 h-3 bg-black rotate-45 -mt-1.5 border-r border-b border-white/10" />
                             </div>
                           </div>
                         )}
                         
                         <div className="mt-4 flex gap-1.5 justify-center md:justify-start">
                           {[0, 1, 2].map((step) => (
                             <div key={step} className="flex flex-col items-center gap-1">
                               <div 
                                 className={`w-10 h-1 rounded-full transition-all duration-500 
                                   ${activeSignal && step === activeSignal.step ? 'bg-black w-14' : 
                                     activeSignal && step < activeSignal.step ? 'bg-black/40' : 'bg-black/10'}`} 
                               />
                               <span className={`text-[7px] font-black uppercase tracking-widest 
                                 ${activeSignal && step === activeSignal.step ? 'text-black' : 'text-black/30'}`}>
                                 {step === 0 ? 'Entrada' : `Gale ${step}`}
                               </span>
                             </div>
                           ))}
                         </div>
                       </div>

                       <div className="pt-6 border-t border-black/10">
                         <p className="text-black/50 font-black text-xs uppercase tracking-[0.2em] mb-4">Relatório de Operação</p>
                         <div className="min-h-[60px]">
                           <AnimatePresence mode="wait">
                             {userRole === 'viewer' ? (
                               <div className="flex items-center gap-2 text-[9px] font-black uppercase text-black/30 italic">
                                 <ShieldCheck size={12} /> Somente Leitura (Visualizador)
                               </div>
                             ) : feedbackStatus === 'submitted' ? (
                               <motion.div key="submitted" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-[10px] font-black uppercase text-black/60">
                                 <CheckCircle2 size={16} className="text-black" /> Feedback Enviado • Memória Atualizada
                               </motion.div>
                             ) : pendingOutcome ? (
                               <motion.div key="justification" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                                 <div className="flex items-center justify-between">
                                   <span className="text-[10px] font-black uppercase text-black/40 flex items-center gap-2">
                                     {pendingOutcome === 'win' ? <CheckCircle2 size={12} className="text-brand-green" /> : <XCircle size={12} className="text-brand-red" />}
                                     {pendingOutcome === 'win' ? 'Relatório de Acerto' : 'Relatório de Erro'}
                                   </span>
                                   <button onClick={() => setPendingOutcome(null)} className="text-[8px] font-black uppercase text-black/20 hover:text-black">Cancelar</button>
                                 </div>
                                 <div className="flex gap-2">
                                   <input value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Justifique o motivo..." className="flex-1 h-10 px-4 bg-black/5 border border-black/10 rounded-xl text-[10px] font-mono text-black focus:outline-none focus:border-black" onKeyDown={(e) => e.key === 'Enter' && submitFeedback()} />
                                   <button onClick={submitFeedback} className="h-10 px-4 bg-black text-brand-yellow rounded-xl font-black text-[10px] uppercase flex items-center gap-2">{feedbackStatus === 'submitting' ? <Activity size={14} className="animate-spin" /> : <Plus size={14} />} ENVIAR</button>
                                 </div>
                               </motion.div>
                             ) : (
                               <motion.div key="buttons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-4">
                                 <span className="text-[9px] font-black uppercase text-black/30">O sinal bateu?</span>
                                 <div className="flex gap-2">
                                   <button onClick={() => setPendingOutcome('win')} className="h-10 px-4 bg-black text-brand-yellow rounded-xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl hover:scale-105 transition-all"><CheckCircle2 size={16} /> ACERTO</button>
                                   <button onClick={() => setPendingOutcome('loss')} className="h-10 px-4 bg-black/10 text-black/40 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 border border-black/5 hover:scale-105 transition-all"><XCircle size={16} /> ERRO</button>
                                 </div>
                               </motion.div>
                             )}
                           </AnimatePresence>
                         </div>
                       </div>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full md:w-auto">
                       {currentSignal !== null && TERMINAL_GROUPS[currentSignal].map(num => (
                         <div key={num} className="bg-black/5 rounded-2xl p-4 border border-black/5 flex flex-col gap-2 scale-95 hover:scale-100 transition-transform">
                           <span className="text-[10px] font-black text-black/30 uppercase text-center">{num} + VIZINHOS</span>
                           <div className="flex gap-1.5 justify-center">
                             {getNeighbors(num).map((n, idx) => (
                               <div key={`${num}-${n}`} className={`w-11 h-11 rounded-xl flex items-center justify-center font-mono font-black text-lg ${idx === 1 ? 'bg-black text-brand-yellow shadow-xl' : 'bg-black/10 text-black/60'}`}>{n}</div>
                             ))}
                           </div>
                         </div>
                       ))}
                     </div>
                   </div>
                 </motion.section>
               ) : (
                 <motion.section 
                   key="solicitation"
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   className="glass-panel p-8 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden"
                 >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 text-brand-yellow font-black text-xs tracking-widest uppercase mb-1">
                        <div className="w-2 h-2 rounded-full bg-brand-yellow animate-ping" />
                        Entrada de Dados
                      </div>
                      <h2 className="text-3xl font-black text-white tracking-tighter leading-tight">
                        {history.length < 7 ? (
                          <>INSIRA OS ÚLTIMOS <span className="text-brand-yellow underline decoration-brand-yellow/30 underline-offset-4">7 NÚMEROS</span></>
                        ) : (
                          <>PRONTO PARA <span className="text-brand-yellow underline decoration-brand-yellow/30 underline-offset-4">ANALISAR</span></>
                        )}
                      </h2>
                      <div className="flex items-center gap-4">
                        <p className="text-xs text-gray-500 font-mono">
                          {history.length < 7 ? `Aguardando ${7 - history.length} entrada(s)...` : 'Dados completos para processamento matemático.'}
                        </p>
                        <div className="h-4 w-px bg-white/10" />
                        <div className="flex items-center gap-1.5">
                          <History size={12} className="text-brand-yellow/50" />
                          <span className="text-[10px] font-black text-white uppercase tracking-widest">{history.length} Entradas Totais</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-6">
                      <div className="flex gap-1.5">
                        {[...Array(7)].map((_, i) => (
                          <div 
                            key={i} 
                            className={`w-10 h-12 rounded-xl flex items-center justify-center font-mono font-black text-base border-2 transition-all duration-500
                              ${history[history.length - 1 - i] !== undefined 
                                ? 'bg-brand-yellow border-brand-yellow text-black shadow-[0_0_10px_rgba(255,221,0,0.2)]' 
                                : 'bg-black/40 border-white/5 text-white/5'}`}
                          >
                            {history[history.length - 1 - i] ?? ''}
                          </div>
                        ))}
                      </div>

                      {history.length >= 7 && (
                        <motion.button
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          onClick={triggerAnalysis}
                          disabled={isAnalyzing}
                          className="bg-brand-yellow text-black h-14 px-8 rounded-2xl font-black text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(255,221,0,0.4)] hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shrink-0"
                        >
                          <Zap size={18} fill="currentColor" /> Analisar
                        </motion.button>
                      )}
                    </div>
                 </motion.section>
               )}
             </AnimatePresence>

             {/* Manual Input Field */}
             <section className="glass-panel p-8 rounded-3xl space-y-4">
               <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">
                 <History size={12} className="text-brand-yellow" />
                 Entrada Manual Sequencial
               </label>
               <input
                 type="text"
                 value={input}
                 onChange={handleInputChange}
                 placeholder="Digite os números ex: 32, 15, 0, 4, 3, 22, 11"
                 className={`w-full bg-black/40 border rounded-2xl px-6 py-5 text-white font-mono placeholder:text-gray-800 focus:outline-none transition-all text-xl
                   ${error ? 'border-brand-red/50 shadow-[0_0_20px_rgba(255,49,49,0.1)]' : 'border-white/5 focus:border-brand-yellow/30'}`}
               />
               {error && (
                 <motion.div
                   initial={{ opacity: 0, y: -5 }}
                   animate={{ opacity: 1, y: 0 }}
                   className="flex items-center gap-2 text-brand-red text-[10px] font-bold font-mono pl-1"
                 >
                   <AlertTriangle size={12} />
                   {error}
                 </motion.div>
               )}
             </section>

             {/* Prob Matrix */}
             <section className="grid grid-cols-5 md:grid-cols-10 gap-2">
               {Object.entries(analysis.probabilities).map(([terminal, prob]) => {
                 const isTarget = currentSignal === parseInt(terminal);
                 const pVal = Math.round(prob as number);
                 return (
                   <div
                     key={terminal}
                     className={`p-3 rounded-2xl flex flex-col items-center justify-center technical-border transition-all
                       ${isTarget ? 'bg-brand-yellow/10 border-brand-yellow shadow-[inset_0_0_15px_rgba(255,221,0,0.1)]' : 'bg-black/30 opacity-40'}`}
                   >
                     <span className="text-[9px] font-black opacity-30 mb-1">T{terminal}</span>
                     <span className={`text-lg font-black font-mono ${isTarget ? 'text-white' : 'text-gray-500'}`}>{pVal}%</span>
                   </div>
                 );
               })}
             </section>
          </div>

          <div className={`${showAiChat ? 'lg:col-span-12 xl:col-span-4' : 'lg:col-span-12 xl:col-span-4'} space-y-4`}>
             {showAiChat && (
               <motion.section 
                 initial={{ opacity: 0, x: 20 }}
                 animate={{ opacity: 1, x: 0 }}
                 className="glass-panel p-6 rounded-3xl border-l-4 border-purple-500 relative overflow-hidden"
               >
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Sparkles size={60} className="text-purple-500" />
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] flex items-center gap-2">
                       <BrainCircuit size={12} /> Quantum Assistant
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${isAiLoading ? 'bg-brand-yellow animate-pulse' : 'bg-brand-green'}`} />
                      <span className="text-[8px] text-gray-500 font-mono uppercase">{isAiLoading ? 'Processando...' : 'Online'}</span>
                    </div>
                  </div>
                  
                  <div className="bg-black/40 rounded-2xl p-4 border border-white/5 min-h-[100px] mb-4">
                    {isAiLoading ? (
                      <div className="space-y-2">
                        <div className="h-2 w-3/4 bg-white/5 rounded animate-pulse" />
                        <div className="h-2 w-1/2 bg-white/5 rounded animate-pulse" />
                        <div className="h-2 w-2/3 bg-white/5 rounded animate-pulse" />
                      </div>
                    ) : aiAdvice ? (
                      <p className="text-[11px] font-mono text-gray-300 leading-relaxed italic">
                        "{aiAdvice}"
                      </p>
                    ) : (
                      <p className="text-[10px] font-mono text-gray-600 text-center py-4">
                        Aguardando sinal para análise neural do Vortex.
                      </p>
                    )}
                  </div>

                  <button 
                    onClick={fetchAiAdvice}
                    disabled={isAiLoading || history.length < 5}
                    className="w-full h-10 glass-panel rounded-xl text-[10px] font-black uppercase tracking-widest text-purple-400 hover:bg-purple-500/10 transition-all flex items-center justify-center gap-2 disabled:opacity-30"
                  >
                    <RotateCcw size={12} /> Recalcular Insights
                  </button>
               </motion.section>
             )}

             {user && (
               <section className="glass-panel p-6 rounded-3xl overflow-hidden relative group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <BrainCircuit size={80} />
                  </div>
                  <h3 className="text-[10px] font-black text-brand-yellow uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <TrendingUp size={12} /> Ciclo de Aprendizado
                  </h3>
                  <div className="space-y-3">
                     <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl">
                        <span className="text-[10px] font-mono text-gray-500 uppercase">Estratégias Mapeadas</span>
                        <span className="text-sm font-black text-white">{Object.keys(bias.strategySuccess).length}</span>
                     </div>
                     <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-brand-yellow/10">
                        <span className="text-[10px] font-mono text-gray-500 uppercase">Ajuste Dinâmico</span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-brand-yellow text-black uppercase animate-pulse">Ativo</span>
                     </div>
                  </div>
               </section>
             )}

             <section className="glass-panel p-6 rounded-3xl h-[240px]">
               <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                 <BarChart3 size={12} /> Probabilidade Relativa
               </h3>
               <div className="h-[140px] w-full">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={chartData}>
                      <Bar dataKey="prob" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.id === currentSignal ? '#FFDD00' : '#222'} 
                          />
                        ))}
                      </Bar>
                      <Tooltip 
                        cursor={{fill: 'transparent'}}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-black border border-white/10 p-2 rounded-lg text-[10px] font-mono">
                                <p className="text-white">{payload[0].value}%</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                   </BarChart>
                 </ResponsiveContainer>
               </div>
             </section>

             <section className="glass-panel p-6 rounded-3xl h-[440px] flex flex-col">
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-6">Lógica de Processamento</h3>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                   {analysis.reasoning.map((r, i) => (
                     <div key={i} className="flex gap-3 items-start animate-in fade-in slide-in-from-left-2 transition-all">
                        <div className="mt-1.5 w-1 h-1 rounded-full bg-brand-yellow shrink-0" />
                        <p className="text-[11px] font-mono text-gray-400 capitalize">{r.toLowerCase()}</p>
                     </div>
                   ))}
                   {analysis.reasoning.length === 0 && (
                     <p className="text-[10px] text-gray-700 font-mono text-center py-10 italic">Aguardando padrões...</p>
                   )}
                </div>
             </section>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <footer className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-mono text-gray-600 uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-brand-yellow" />
          © 2026 QUANTUM ANALYST ENGINE • CRYPTO-GRADE SECURITY
        </div>
        <div className="flex gap-6">
          <span className="flex items-center gap-2 underline underline-offset-4 decoration-brand-yellow/30">
            <ShieldCheck size={12} /> ALGORITMO VERIFICADO
          </span>
          <span className="flex items-center gap-2">
            <AlertTriangle size={12} className="text-brand-yellow" /> RISCO CONTROLADO
          </span>
        </div>
      </footer>
    </div>
  );
}
