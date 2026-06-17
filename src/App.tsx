import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { db, auth, signInAnonymously } from './firebase';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  updateDoc, 
  arrayUnion,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { 
  generateQuestion, 
  checkAnswer, 
  type Question 
} from './utils/mathEngine';

// 定義學生的資料結構
interface StudentData {
  uid: string;
  classId: string;
  seatNo: string;
  nickname: string;
  score: number;
  correctCount: number;
  totalCount: number;
  timeSpent: number;
  lastActive: number;
  scratchpads: string[];
}

// 定義房間控制狀態
interface RoomState {
  currentPick: {
    uid: string;
    nickname: string;
    timestamp: number;
  } | null;
}

export default function App() {
  // 基礎路由狀態：'login' | 'student' | 'teacher'
  const [view, setView] = useState<'login' | 'student' | 'teacher'>('login');
  
  // 學生資訊
  const [classId, setClassId] = useState('');
  const [seatNo, setSeatNo] = useState('');
  const [nickname, setNickname] = useState('');
  const [studentUid, setStudentUid] = useState('');
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [localScratchpads, setLocalScratchpads] = useState<string[]>([]);
  
  // 遊戲與答題狀態
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [inputAnswer, setInputAnswer] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0); // 本輪答題進度 1~10
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const [answerFeedback, setAnswerFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false); // 鎖定防重送
  
  // 幸運卡
  const [luckyCardsUsed, setLuckyCardsUsed] = useState(0);
  const [showTip, setShowTip] = useState(false);
  
  // 檔案上傳
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 教師端與排行榜狀態
  const [leaderboard, setLeaderboard] = useState<StudentData[]>([]);
  const [roomState, setRoomState] = useState<RoomState>({ currentPick: null });
  const [selectedScratchpad, setSelectedScratchpad] = useState<string | null>(null); // 教師端放大看的手寫算式
  
  // 抽籤滾動動畫狀態
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnName, setDrawnName] = useState('');
  
  // 監聽抽籤事件（對學生端）
  const [isDrawnByUser, setIsDrawnByUser] = useState(false);

  // 1. 初始化監聽排行榜 (適用於教師端與登入頁展示)
  useEffect(() => {
    const qLeaderboard = query(
      collection(db, "students"),
      orderBy("score", "desc"),
      orderBy("timeSpent", "asc")
    );
    
    const unsubscribe = onSnapshot(qLeaderboard, (snapshot) => {
      const list: StudentData[] = [];
      snapshot.forEach((doc) => {
        list.push({ uid: doc.id, ...doc.data() } as StudentData);
      });
      setLeaderboard(list);
    });
    
    return () => unsubscribe();
  }, []);

  // 2. 監聽房間狀態 (抽籤連動)
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "rooms", "default"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as RoomState;
        setRoomState(data);
        
        // 如果學生已登入，且中籤的人是自己
        if (studentUid && data.currentPick && data.currentPick.uid === studentUid) {
          // 檢查是否為 10 秒內觸發的抽籤，防止舊抽籤資訊重新整理時重複彈出
          const secondsDiff = (Date.now() - data.currentPick.timestamp) / 1000;
          if (secondsDiff < 10) {
            setIsDrawnByUser(true);
            // 觸發撒花
            triggerConfettiPattern();
          }
        }
      }
    });
    
    return () => unsubscribe();
  }, [studentUid]);

  // 3. 學生作答計時器
  useEffect(() => {
    let timer: number;
    if (isPlaying && !isSubmitting) {
      timer = window.setInterval(() => {
        setTimeSpent((prev) => {
          const nextTime = prev + 1;
          // 同步時間到 Firestore (每 5 秒同步一次，避免頻繁寫入)
          if (nextTime % 5 === 0 && studentUid && !isLocalMode) {
            updateDoc(doc(db, "students", studentUid), {
              timeSpent: nextTime,
              lastActive: Date.now()
            }).catch(e => console.error(e));
          }
          return nextTime;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPlaying, isSubmitting, studentUid]);

  // 觸發多重撒花
  const triggerConfettiPattern = () => {
    const duration = 4 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1100 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval = window.setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  };

  // 學生登入並開始
  const handleStartGame = async () => {
    if (!classId.trim() || !seatNo.trim() || !nickname.trim()) {
      alert("請完整填寫班級、座號與姓名/暱稱！");
      return;
    }
    if (selectedType === null) {
      alert("請選擇一個想要訓練的二次根式題型！");
      return;
    }

    setIsSubmitting(true);
    let uid = "";
    let localModeActive = false;

    try {
      // 進行匿名登入
      const userCredential = await signInAnonymously(auth);
      uid = userCredential.user.uid;
    } catch (authErr: any) {
      console.error("Firebase 匿名登入失敗，嘗試切換為單機模式：", authErr);
      const isAuthDisabled = authErr.code === 'auth/admin-restricted-operation' || authErr.message?.includes('admin-restricted-operation');
      
      let errorMsg = "Firebase 登入失敗。";
      if (isAuthDisabled) {
        errorMsg = "您的 Firebase 專案尚未在 Console 中啟用「匿名登入 (Anonymous Auth)」方法。\n請前往 Firebase 控制台 -> Authentication -> Sign-in Method 將「匿名登入」切換為「啟用」！\n\n";
      }
      
      const useLocal = window.confirm(`${errorMsg}是否切換為【本地單機訓練模式】進行練習？\n(單機模式下成績無法同步到老師的大螢幕，但遊戲可以正常遊玩)`);
      if (!useLocal) {
        setIsSubmitting(false);
        return;
      }
      
      // 使用本地臨時 UUID
      uid = `local_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      localModeActive = true;
    }

    setStudentUid(uid);
    setIsLocalMode(localModeActive);
    setLocalScratchpads([]);

    // 建立該學生的 Firestore 紀錄 (非單機模式)
    if (!localModeActive) {
      try {
        const sData: StudentData = {
          uid,
          classId: classId.trim(),
          seatNo: seatNo.trim(),
          nickname: nickname.trim(),
          score: 0,
          correctCount: 0,
          totalCount: 0,
          timeSpent: 0,
          lastActive: Date.now(),
          scratchpads: []
        };
        await setDoc(doc(db, "students", uid), sData);
      } catch (dbErr) {
        console.error("寫入 Firestore 失敗，自動降級為單機模式：", dbErr);
        setIsLocalMode(true);
      }
    }

    // 初始化答題狀態
    setScore(0);
    setCorrectCount(0);
    setTimeSpent(0);
    setQuestionIndex(1);
    setLuckyCardsUsed(0);
    setShowTip(false);
    setInputAnswer('');
    
    // 產生第一題
    const firstQ = generateQuestion(selectedType);
    setCurrentQuestion(firstQ);
    setIsPlaying(true);
    setView('student');
    setIsSubmitting(false);
  };

  // 鍵盤輸入處理
  const handleKeyPress = (char: string) => {
    if (isSubmitting || answerFeedback) return;
    setInputAnswer((prev) => prev + char);
  };

  const handleBackspace = () => {
    if (isSubmitting || answerFeedback) return;
    setInputAnswer((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (isSubmitting || answerFeedback) return;
    setInputAnswer('');
  };

  // 幸運卡機制
  const handleLuckyCard = () => {
    if (isSubmitting || answerFeedback || !currentQuestion) return;
    if (luckyCardsUsed >= 2) {
      alert("每局最多隻能使用 2 張幸運卡！");
      return;
    }

    const confirmUse = window.confirm(`確認使用幸運卡嗎？(目前已使用: ${luckyCardsUsed}/2)\n這將使用掉一次額外求助機會。`);
    if (!confirmUse) return;

    // 隨機決定是「提示卡」還是「免死金牌卡」
    const cardType = Math.random() < 0.5 ? 'tip' : 'skip';
    
    if (cardType === 'tip') {
      setShowTip(true);
      alert(`獲得【公式提示卡】！\n提示：${currentQuestion.tips}`);
    } else {
      // 免死跳過
      alert(`獲得【免死金牌卡】！\n直接獲得一半分數 (+5分) 並跳過此題！`);
      setLuckyCardsUsed((prev) => prev + 1);
      handleQuestionSkip();
    }
  };

  // 跳過當前題目
  const handleQuestionSkip = async () => {
    if (!studentUid || !currentQuestion) return;
    
    const nextScore = score + 5;
    setScore(nextScore);
    setInputAnswer('');
    setShowTip(false);
    
    // 更新資料庫 (非單機模式)
    if (!isLocalMode) {
      try {
        await updateDoc(doc(db, "students", studentUid), {
          score: nextScore,
          totalCount: questionIndex,
          lastActive: Date.now()
        });
      } catch (e) {
        console.error(e);
      }
    }

    if (questionIndex >= 10) {
      // 結束本輪
      setIsPlaying(false);
      triggerConfettiPattern();
      alert(`練習結束！您本輪獲得了 ${nextScore} 分！`);
    } else {
      setQuestionIndex((prev) => prev + 1);
      setCurrentQuestion(generateQuestion(selectedType!));
    }
  };

  // 答案確認提交
  const handleAnswerSubmit = async () => {
    if (isSubmitting || answerFeedback || !currentQuestion || !studentUid) return;
    if (!inputAnswer.trim()) {
      alert("請輸入您的答案！");
      return;
    }

    setIsSubmitting(true);
    const isCorrect = checkAnswer(inputAnswer, currentQuestion.correctAnswer);
    
    let nextScore = score;
    let nextCorrectCount = correctCount;

    if (isCorrect) {
      setAnswerFeedback('correct');
      nextScore += 10;
      nextCorrectCount += 1;
      setScore(nextScore);
      setCorrectCount(nextCorrectCount);
      // 灑花
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } });
    } else {
      setAnswerFeedback('incorrect');
    }

    // 更新 Firestore 學生資料 (非單機模式)
    if (!isLocalMode) {
      try {
        await updateDoc(doc(db, "students", studentUid), {
          score: nextScore,
          correctCount: nextCorrectCount,
          totalCount: questionIndex,
          lastActive: Date.now()
        });
      } catch (e) {
        console.error("更新成績失敗：", e);
      }
    }

    // 延遲 1.5 秒進入下一題，讓學生看清對錯反饋
    setTimeout(() => {
      setAnswerFeedback(null);
      setInputAnswer('');
      setShowTip(false);
      setIsSubmitting(false);

      if (questionIndex >= 10) {
        // 完成 10 題
        setIsPlaying(false);
        triggerConfettiPattern();
        alert(`恭喜完成 10 題訓練！總分: ${nextScore} 分，答對率: ${Math.round((nextCorrectCount/10)*100)}%！`);
      } else {
        setQuestionIndex((prev) => prev + 1);
        setCurrentQuestion(generateQuestion(selectedType!));
      }
    }, 1500);
  };

  // 手寫算式拍照上傳 (使用 tmpfiles.org)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !studentUid) return;

    // 限制大小 8MB
    if (file.size > 8 * 1024 * 1024) {
      alert("照片大小不能超過 8MB！");
      return;
    }

    setUploadProgress(0);
    setUploadMessage("上傳中...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      // 使用 XMLHttpRequest 以取得上傳進度
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://tmpfiles.org/api/v1/upload", true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = async () => {
        if (xhr.status === 200) {
          const res = JSON.parse(xhr.responseText);
          // tmpfiles.org 返回的 url 需要將 tmpfiles.org/ 替換為 tmpfiles.org/dl/ 以直接預覽與下載
          const rawUrl = res.data.url;
          const downloadUrl = rawUrl.replace("tmpfiles.org/", "tmpfiles.org/dl/");

          // 將下載網址加入到學生的 Firestore 紀錄中 (非單機模式)
          if (!isLocalMode) {
            await updateDoc(doc(db, "students", studentUid), {
              scratchpads: arrayUnion(downloadUrl),
              lastActive: Date.now()
            });
          } else {
            setLocalScratchpads((prev) => [...prev, downloadUrl]);
          }

          setUploadProgress(null);
          setUploadMessage("✅ 上傳成功！過程已同步至老師大螢幕！");
          setTimeout(() => setUploadMessage(''), 4000);
        } else {
          throw new Error("上傳失敗");
        }
      };

      xhr.onerror = () => {
        throw new Error("網絡錯誤");
      };

      xhr.send(formData);
    } catch (err) {
      console.error(err);
      setUploadProgress(null);
      setUploadMessage("❌ 上傳失敗，請重試！");
    }
  };

  // 教師端：重設全班分數與進度
  const handleResetClass = async () => {
    const confirmReset = window.confirm("確定要重設全班的所有分數與手寫照片記錄嗎？此動作無法復原。");
    if (!confirmReset) return;

    try {
      const snapshot = await getDocs(collection(db, "students"));
      const batch = writeBatch(db);
      snapshot.forEach((doc) => {
        batch.update(doc.ref, {
          score: 0,
          correctCount: 0,
          totalCount: 0,
          timeSpent: 0,
          scratchpads: []
        });
      });
      await batch.commit();
      
      // 清空抽籤狀態
      await setDoc(doc(db, "rooms", "default"), { currentPick: null });
      alert("已成功重設全班資料！");
    } catch (e) {
      console.error(e);
      alert("重設失敗，請檢查權限！");
    }
  };

  // 教師端：隨機抽籤
  const handleRandomPick = async () => {
    if (leaderboard.length === 0) {
      alert("目前沒有在線學生可以抽籤！");
      return;
    }

    setIsDrawing(true);
    let counter = 0;
    const intervalTime = 100; // 100ms 滾動一次
    const duration = 2000;    // 滾動 2 秒
    const steps = duration / intervalTime;

    const interval = window.setInterval(async () => {
      const randomIndex = Math.floor(Math.random() * leaderboard.length);
      const randomStudent = leaderboard[randomIndex];
      setDrawnName(`${randomStudent.classId} ${randomStudent.seatNo}號 ${randomStudent.nickname}`);
      counter++;

      if (counter >= steps) {
        clearInterval(interval);
        
        // 最終中籤者
        const finalStudent = leaderboard[randomIndex];
        
        // 寫入 Firestore 讓學生端接收連動
        try {
          await setDoc(doc(db, "rooms", "default"), {
            currentPick: {
              uid: finalStudent.uid,
              nickname: finalStudent.nickname,
              timestamp: Date.now()
            }
          });
        } catch (e) {
          console.error("更新抽籤狀態失敗：", e);
        }
        
        setIsDrawing(false);
      }
    }, intervalTime);
  };

  // 格式化時間 (秒 -> mm:ss)
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 渲染二次根式 HTML 元件
  const renderRadicalHtml = (radicalObj?: { inside: string; coefficient?: string; under?: string }) => {
    if (!radicalObj) return null;
    return (
      <span className="coeff-radical">
        {radicalObj.coefficient && <span>{radicalObj.coefficient}</span>}
        <span className="radical-container">
          <span className="radical-symbol">√</span>
          {radicalObj.under ? (
            <span className="radical-content">
              <span className="fraction-container">
                <span className="fraction-numerator">{radicalObj.inside}</span>
                <span className="fraction-denominator">{radicalObj.under}</span>
              </span>
            </span>
          ) : (
            <span className="radical-content">{radicalObj.inside}</span>
          )}
        </span>
      </span>
    );
  };

  // 渲染普通分數 HTML 元件
  const renderFractionHtml = (fractionObj?: { num: string; den: string }) => {
    if (!fractionObj) return null;
    return (
      <span className="fraction-container">
        <span className="fraction-numerator">{fractionObj.num}</span>
        <span className="fraction-denominator">{fractionObj.den}</span>
      </span>
    );
  };

  // 渲染題目顯示區域
  const renderQuestionDisplay = (q: Question) => {
    return (
      <div style={{ fontSize: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '20px 0', minHeight: '80px', fontWeight: '500' }}>
        {q.questionDisplay.prefix && <span style={{ marginRight: '8px' }}>{q.questionDisplay.prefix}</span>}
        
        {q.questionDisplay.radical && renderRadicalHtml(q.questionDisplay.radical)}
        
        {q.questionDisplay.fraction && renderFractionHtml(q.questionDisplay.fraction)}
        
        {/* 如果不屬於前兩者，則直接以純文字或渲染包含平方的字元 */}
        {!q.questionDisplay.radical && !q.questionDisplay.fraction && (
          <span>{q.questionDisplay.rawText}</span>
        )}
      </div>
    );
  };

  // ==================== 1. 登入/設定畫面 ====================
  if (view === 'login') {
    return (
      <div className="glass-card" style={{ maxWidth: '480px', marginTop: '40px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px', fontSize: '1.6rem', color: '#818cf8' }}>
          二次根式化簡訓練助手
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>班級 (如 801)</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="請輸入班級" 
              value={classId} 
              onChange={(e) => setClassId(e.target.value)}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>座號 (如 05)</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="請輸入座號" 
              value={seatNo} 
              onChange={(e) => setSeatNo(e.target.value)}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>姓名/暱稱</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="請輸入姓名/暱稱" 
              value={nickname} 
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>請選擇訓練題型</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {[
                { id: 1, name: "開平方" },
                { id: 2, name: "平方計算" },
                { id: 3, name: "根式乘法" },
                { id: 4, name: "根式化簡" },
                { id: 5, name: "根式加減" },
                { id: 6, name: "分母有理化" }
              ].map((t) => (
                <button
                  key={t.id}
                  className={`btn ${selectedType === t.id ? '' : 'btn-secondary'}`}
                  style={{ padding: '10px', fontSize: '0.85rem' }}
                  onClick={() => setSelectedType(t.id)}
                >
                  題型{t.id === 1 ? '一' : t.id === 2 ? '二' : t.id === 3 ? '三' : t.id === 4 ? '四' : t.id === 5 ? '五' : '六'}<br/>{t.name}
                </button>
              ))}
            </div>
          </div>
          
          <button 
            className="btn" 
            style={{ width: '100%', padding: '14px', marginTop: '10px', fontSize: '1.1rem' }}
            onClick={handleStartGame}
            disabled={isSubmitting}
          >
            {isSubmitting ? "登入並初始化中..." : "開始答題"}
          </button>
          
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
            <button 
              className="btn btn-secondary" 
              style={{ fontSize: '0.85rem', width: '100%' }}
              onClick={() => setView('teacher')}
            >
              進入教師大螢幕看板 🖥️
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== 2. 學生答題主畫面 ====================
  if (view === 'student') {
    return (
      <div className="container" style={{ maxWidth: '600px' }}>
        {/* 中籤全螢幕覆蓋 */}
        {isDrawnByUser && (
          <div className="draw-overlay" onClick={() => setIsDrawnByUser(false)}>
            <div className="draw-content">
              <h1 style={{ fontSize: '3rem', color: '#fbbf24', marginBottom: '16px' }}>🎉 你被選中了！</h1>
              <p style={{ fontSize: '1.2rem', color: '#ffffff', marginBottom: '24px' }}>
                老師在黑板投影了大螢幕，請準備好上台或回答問題喔！
              </p>
              <button className="btn" onClick={() => setIsDrawnByUser(false)}>收到，馬上準備！</button>
            </div>
          </div>
        )}

        <div className="glass-card">
          {/* 上方狀態 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px', marginBottom: '12px' }}>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>學生：</span>
              <span style={{ fontWeight: '600' }}>{classId} 班 {seatNo} 號 {nickname}</span>
              {isLocalMode && (
                <span style={{ marginLeft: '8px', padding: '2px 6px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                  ⚠️ 單機模式
                </span>
              )}
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>題型：</span>
              <span style={{ color: '#818cf8', fontWeight: '500' }}>{currentQuestion?.typeName}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', textAlign: 'center', fontSize: '0.9rem', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-secondary)' }}>分數</div>
              <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#818cf8' }}>{score}</div>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-secondary)' }}>進度</div>
              <div style={{ fontSize: '1.2rem', fontWeight: '700' }}>{questionIndex} / 10</div>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-secondary)' }}>答對率</div>
              <div style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--color-success)' }}>
                {questionIndex > 1 ? Math.round((correctCount / (questionIndex - 1)) * 100) : 0}%
              </div>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-secondary)' }}>時間</div>
              <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f59e0b' }}>{formatTime(timeSpent)}</div>
            </div>
          </div>

          {/* 題目區塊 */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '120px' }}>
            {currentQuestion ? renderQuestionDisplay(currentQuestion) : <div>載入題目中...</div>}
            
            {showTip && currentQuestion && (
              <div style={{ fontSize: '0.85rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', padding: '8px 12px', borderRadius: '8px', width: '100%', marginTop: '10px', textAlign: 'center' }}>
                💡 {currentQuestion.tips}
              </div>
            )}
          </div>

          {/* 答案顯示區 */}
          <div 
            style={{ 
              marginTop: '16px', 
              background: answerFeedback === 'correct' 
                ? 'rgba(16, 185, 129, 0.15)' 
                : answerFeedback === 'incorrect' 
                ? 'rgba(239, 68, 68, 0.15)' 
                : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${
                answerFeedback === 'correct' 
                  ? 'var(--color-success)' 
                  : answerFeedback === 'incorrect' 
                  ? 'var(--color-error)' 
                  : 'rgba(255, 255, 255, 0.1)'
              }`,
              borderRadius: '12px', 
              padding: '16px', 
              fontSize: '1.5rem', 
              textAlign: 'center', 
              minHeight: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: inputAnswer ? '#ffffff' : 'var(--text-muted)'
            }}
          >
            {answerFeedback === 'correct' && "🎉 答對了！+10 分"}
            {answerFeedback === 'incorrect' && `❌ 答錯了！標準答案: ${currentQuestion?.correctAnswerDisplay}`}
            {!answerFeedback && (inputAnswer || "請利用下方鍵盤輸入答案...")}
          </div>

          {/* 虛擬鍵盤 */}
          <div className="keyboard-grid">
            {/* 第一排 */}
            <button className="key-btn operator" onClick={() => handleKeyPress('√')}>√</button>
            <button className="key-btn operator" onClick={() => handleKeyPress('+')}>+</button>
            <button className="key-btn operator" onClick={() => handleKeyPress('-')}>-</button>
            <button className="key-btn operator" onClick={() => handleKeyPress('a')}>a</button>

            {/* 第二排 */}
            <button className="key-btn" onClick={() => handleKeyPress('7')}>7</button>
            <button className="key-btn" onClick={() => handleKeyPress('8')}>8</button>
            <button className="key-btn" onClick={() => handleKeyPress('9')}>9</button>
            <button className="key-btn operator" onClick={() => handleKeyPress('b')}>b</button>

            {/* 第三排 */}
            <button className="key-btn" onClick={() => handleKeyPress('4')}>4</button>
            <button className="key-btn" onClick={() => handleKeyPress('5')}>5</button>
            <button className="key-btn" onClick={() => handleKeyPress('6')}>6</button>
            <button className="key-btn operator" onClick={() => handleKeyPress('c')}>c</button>

            {/* 第四排 */}
            <button className="key-btn" onClick={() => handleKeyPress('1')}>1</button>
            <button className="key-btn" onClick={() => handleKeyPress('2')}>2</button>
            <button className="key-btn" onClick={() => handleKeyPress('3')}>3</button>
            <button className="key-btn operator" onClick={() => handleKeyPress('/')}>/</button>

            {/* 第五排 */}
            <button className="key-btn" style={{ gridColumn: 'span 2' }} onClick={() => handleKeyPress('0')}>0</button>
            <button className="key-btn operator" onClick={() => handleKeyPress('²')}>x²</button>
            <button className="key-btn backspace" onClick={handleBackspace}>⌫</button>
          </div>

          {/* 功能控制區 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '12px' }}>
            {/* 上傳按鈕 */}
            <button 
              className="key-btn action-upload" 
              style={{ fontSize: '0.95rem' }} 
              onClick={() => fileInputRef.current?.click()}
            >
              📷 上傳
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="image/*" 
              onChange={handleFileUpload}
            />

            {/* 幸運卡按鈕 */}
            <button 
              className="key-btn lucky-card" 
              style={{ fontSize: '0.95rem' }} 
              onClick={handleLuckyCard}
              disabled={luckyCardsUsed >= 2}
            >
              🍀 幸運卡 ({2 - luckyCardsUsed})
            </button>

            {/* 清空按鈕 */}
            <button 
              className="key-btn action-clear" 
              style={{ fontSize: '0.95rem' }} 
              onClick={handleClear}
            >
              🗑️ 清空
            </button>

            {/* 確認按鈕 */}
            <button 
              className="key-btn submit" 
              style={{ fontSize: '0.95rem' }} 
              onClick={handleAnswerSubmit}
              disabled={isSubmitting}
            >
              ✔️ 確認
            </button>
          </div>

          {/* 上傳進度與消息 */}
          {(uploadProgress !== null || uploadMessage) && (
            <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '0.85rem' }}>
              {uploadProgress !== null && (
                <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', height: '6px', overflow: 'hidden', marginBottom: '4px' }}>
                  <div style={{ width: `${uploadProgress}%`, background: 'var(--color-primary)', height: '100%', transition: 'width 0.1s' }}></div>
                </div>
              )}
              <div style={{ color: '#fbbf24' }}>{uploadMessage}</div>
            </div>
          )}

          {/* 返回按鈕 */}
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
            <button 
              className="btn btn-secondary" 
              style={{ fontSize: '0.8rem', padding: '6px 16px' }}
              onClick={() => {
                const exit = window.confirm("確定要退出目前答題嗎？目前進度將不會保留。");
                if (exit) setView('login');
              }}
            >
              返回主畫面
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== 3. 教師端/大螢幕看板畫面 ====================
  return (
    <div className="container" style={{ maxWidth: '1100px' }}>
      {/* 放大手寫照片 Modal */}
      {selectedScratchpad && (
        <div className="draw-overlay" onClick={() => setSelectedScratchpad(null)}>
          <div style={{ maxWidth: '90%', maxHeight: '90%', position: 'relative' }}>
            <img 
              src={selectedScratchpad} 
              alt="放大手寫過程" 
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '12px', border: '2px solid rgba(255,255,255,0.2)' }} 
            />
            <div style={{ textAlign: 'center', marginTop: '10px', color: '#ffffff' }}>點擊任何地方關閉</div>
          </div>
        </div>
      )}

      {/* 抽籤滾動覆蓋層 */}
      {isDrawing && (
        <div className="draw-overlay">
          <div className="draw-content">
            <h2 style={{ fontSize: '1.8rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>🎯 隨機抽籤中...</h2>
            <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#fbbf24', padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
              {drawnName || "準備中"}
            </div>
          </div>
        </div>
      )}

      <div className="header">
        <h1>二次根式訓練大螢幕看板 🖥️</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => setView('login')}>
            返回學生登入
          </button>
          <button className="btn btn-secondary" style={{ borderColor: 'var(--color-error)', color: '#f87171' }} onClick={handleResetClass}>
            重設全班資料 🗑️
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* 左側：即時排行榜 */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.2rem', color: '#818cf8' }}>🏆 即時答題排行榜</h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>在線人數: {leaderboard.length} 人</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>排名</th>
                  <th>班級座號</th>
                  <th>學生姓名</th>
                  <th>累計分數</th>
                  <th>答對題數 / 作答總數</th>
                  <th>答對率</th>
                  <th>所花時間</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>
                      目前沒有學生加入作答。快讓學生掃碼或輸入網址開始吧！
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((student, idx) => {
                    const rank = idx + 1;
                    const accuracy = student.totalCount > 0 
                      ? Math.round((student.correctCount / student.totalCount) * 100) 
                      : 0;
                    
                    return (
                      <tr key={student.uid}>
                        <td>
                          <span className={`rank-badge ${rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other'}`}>
                            {rank}
                          </span>
                        </td>
                        <td>{student.classId} 班 {student.seatNo} 號</td>
                        <td style={{ fontWeight: '500' }}>{student.nickname}</td>
                        <td style={{ color: '#818cf8', fontWeight: '700' }}>{student.score} 分</td>
                        <td>{student.correctCount} / {student.totalCount}</td>
                        <td style={{ color: accuracy >= 80 ? 'var(--color-success)' : accuracy >= 50 ? '#fbbf24' : 'var(--text-primary)' }}>
                          {accuracy}%
                        </td>
                        <td>{formatTime(student.timeSpent)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 右側：互動控制與算式牆 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 抽籤控制 */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.1rem', color: '#fbbf24', marginBottom: '14px' }}>🎯 課堂互動抽籤</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              點擊抽取一名在線學生回答問題，學生端會收到全螢幕通知與灑花動畫！
            </p>
            <button className="btn" style={{ width: '100%', background: 'linear-gradient(to right, #f59e0b, #d97706)' }} onClick={handleRandomPick}>
              🎲 開始隨機抽籤
            </button>

            {roomState.currentPick && (
              <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>最近中籤者</div>
                <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fbbf24', marginTop: '4px' }}>
                  {roomState.currentPick.nickname}
                </div>
              </div>
            )}
          </div>

          {/* 手寫算式展示牆 */}
          <div className="glass-card" style={{ flex: 1 }}>
            <h3 style={{ fontSize: '1.1rem', color: '#818cf8', marginBottom: '10px' }}>📷 學生手寫算式牆</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              學生在手機上傳的手寫算式會即時顯示在此處，點擊可放大講評：
            </p>
            
            <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
              <div className="scratchpad-gallery">
                {leaderboard.filter(s => s.scratchpads && s.scratchpads.length > 0).flatMap(student => 
                  student.scratchpads.map((url, uIdx) => ({
                    url,
                    studentName: `${student.classId}-${student.seatNo} ${student.nickname}`,
                    key: `${student.uid}-${uIdx}`
                  }))
                ).length === 0 ? (
                  <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    尚無學生上傳手寫算式照片。
                  </div>
                ) : (
                  leaderboard.filter(s => s.scratchpads && s.scratchpads.length > 0).flatMap(student => 
                    student.scratchpads.map((url, uIdx) => (
                      <div 
                        className="scratchpad-thumbnail" 
                        key={`${student.uid}-${uIdx}`}
                        onClick={() => setSelectedScratchpad(url)}
                      >
                        <img src={url} alt={`${student.nickname}的手寫過程`} />
                        <div className="scratchpad-author">
                          {student.classId}-{student.seatNo} {student.nickname}
                        </div>
                      </div>
                    ))
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
