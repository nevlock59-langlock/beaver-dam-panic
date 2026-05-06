import { useState, useEffect, useCallback, useRef } from 'react';
import twemoji from 'twemoji';
import beaverImg from './assets/beaver.png';
import './App.css';

const GAME_DURATION = 30;
const MAX_PRESSURE = 100;

const HOLE_TYPES = [
  { id: 'small', emoji: '💧', label: 'Small', repair: 'leaf', score: 10, pressureInc: 5 },
  { id: 'medium', emoji: '🌊', label: 'Medium', repair: 'wood', score: 20, pressureInc: 8 },
  { id: 'large', emoji: '🌋', label: 'Large', repair: 'stone', score: 50, pressureInc: 15 },
];

const MATERIALS = [
  { id: 'leaf', emoji: '🍃', label: 'Leaf' },
  { id: 'wood', emoji: '🪵', label: 'Wood' },
  { id: 'stone', emoji: '🪨', label: 'Stone' },
];

const Emoji = ({ symbol, className = "" }) => {
  if (!symbol) return null;
  
  // Parse the emoji symbol using twemoji to get SVG images
  const html = twemoji.parse(symbol, {
    folder: 'svg',
    ext: '.svg',
    base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/'
  });

  return (
    <span 
      className={`emoji-container ${className}`} 
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

function App() {
  const [gameState, setGameState] = useState('START'); // START, PLAYING, GAMEOVER
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => Number(localStorage.getItem('beaver-high-score')) || 0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [pressure, setPressure] = useState(0);
  const [holes, setHoles] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [combo, setCombo] = useState(0);
  const [feedbacks, setFeedbacks] = useState([]);
  const [screenEffect, setScreenEffect] = useState(null); // 'success', 'failure'
  const [displayedScore, setDisplayedScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [stars, setStars] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [beaverAction, setBeaverAction] = useState('idle'); // idle, joy, panic
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showSpeedUpToast, setShowSpeedUpToast] = useState(false);

  const gameLoopRef = useRef(null);
  const holeSpawnRef = useRef(null);
  const holesRef = useRef([]);
  const timeLeftRef = useRef(GAME_DURATION);

  // Sync refs with state for use in intervals without re-triggering them
  useEffect(() => {
    holesRef.current = holes;
  }, [holes]);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  const spawnHole = useCallback(() => {
    if (isPaused || gameState !== 'PLAYING') return;
    setHoles((prev) => {
      if (prev.length >= 5) return prev;

      const type = HOLE_TYPES[Math.floor(Math.random() * HOLE_TYPES.length)];
      let newX, newY, tooClose;
      let attempts = 0;
      
      do {
        newX = Math.random() * 80 + 10;
        newY = Math.random() * 65 + 10;
        tooClose = prev.some(h => Math.sqrt(Math.pow(h.x - newX, 2) + Math.pow(h.y - newY, 2)) < 15);
        attempts++;
      } while (tooClose && attempts < 10);

      const newHole = {
        id: Date.now() + Math.random(),
        type: type.id,
        x: newX,
        y: newY,
        createdAt: Date.now(),
      };
      return [...prev, newHole];
    });
  }, [isPaused, gameState]);

  const startGame = () => {
    setScore(0);
    setTimeLeft(GAME_DURATION);
    timeLeftRef.current = GAME_DURATION;
    setPressure(0);
    setHoles([]);
    holesRef.current = [];
    setSelectedMaterial(null);
    setCombo(0);
    setFeedbacks([]);
    setScreenEffect(null);
    setIsNewRecord(false);
    setIsPaused(false);
    setStars(0);
    setBeaverAction('idle');
    setGameState('COUNTDOWN');
    setCountdown(3);
    setShowSpeedUpToast(false);
  };

  useEffect(() => {
    if (gameState === 'COUNTDOWN' && countdown !== null) {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(timer);
      } else if (countdown === 0) {
        const timer = setTimeout(() => {
          setGameState('PLAYING');
          setCountdown(null);
          spawnHole();
        }, 400); // 0.3~0.5초 사이 첫 구멍 생성
        return () => clearTimeout(timer);
      }
    }
  }, [gameState, countdown, spawnHole]);

  const endGame = useCallback(() => {
    const newRecord = score > highScore;
    
    let earnedStars = 1;
    if (score >= 600) earnedStars = 3;
    else if (score >= 300) earnedStars = 2;
    if (pressure >= MAX_PRESSURE) earnedStars = 0;

    setTimeout(() => {
      setGameState('GAMEOVER');
      setDisplayedScore(0);
      setStars(earnedStars);
      if (newRecord) setIsNewRecord(true);
    }, 1500);
    
    if (newRecord) {
      setHighScore(score);
      localStorage.setItem('beaver-high-score', score.toString());
    }
  }, [score, highScore, pressure]);

  // Score count-up effect
  useEffect(() => {
    if (gameState === 'GAMEOVER' && displayedScore < score) {
      const timer = setTimeout(() => {
        const diff = score - displayedScore;
        const step = Math.max(1, Math.floor(diff / 10));
        setDisplayedScore((prev) => Math.min(score, prev + step));
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [gameState, score, displayedScore]);

  // Game Timer & Pressure Tick
  useEffect(() => {
    if (gameState === 'PLAYING' && !isPaused) {
      gameLoopRef.current = setInterval(() => {
        // Time update
        setTimeLeft((prev) => {
          const next = prev - 1;
          if (next === 20) {
            setShowSpeedUpToast(true);
            setTimeout(() => setShowSpeedUpToast(false), 1000);
          }
          if (next <= 0) {
            clearInterval(gameLoopRef.current);
            endGame();
            return 0;
          }
          return next;
        });
        
        // Pressure update
        setPressure((prev) => {
          const currentHoles = holesRef.current;
          const currentTime = timeLeftRef.current;

          // [불변조건 1] 구멍이 없으면 압력은 절대 증가하지 않는다.
          if (!currentHoles || currentHoles.length === 0) {
            return prev;
          }

          // 기본 상승폭: 구멍이 있을 때만 의미 있게 상승
          let increment = 1.5; 
          
          // 시간 경과에 따른 가속 (남은 시간 기준)
          if (currentTime <= 20) increment += 1.0; // 10초 경과 (남은 시간 20초 이하)
          if (currentTime <= 10) increment += 2.0; // 20초 경과 (남은 시간 10초 이하)
          
          // 개별 구멍당 수압 기여도 (강화)
          increment += (currentHoles.length * 2.0);
          
          // 위험 구간 추가 페널티
          if (prev >= 80) increment += 1.0;

          const next = prev + increment;
          
          if (next >= MAX_PRESSURE) {
            clearInterval(gameLoopRef.current);
            endGame();
            return MAX_PRESSURE;
          }
          return next;
        });
      }, 1000);

      return () => clearInterval(gameLoopRef.current);
    }
  }, [gameState, isPaused, endGame]);

  // Hole Spawning Logic
  useEffect(() => {
    if (gameState === 'PLAYING' && !isPaused) {
      const getSpawnInterval = (elapsed) => {
        if (elapsed < 10) return 1400; // 0~10초
        if (elapsed < 20) return 1100; // 10~20초
        return 900;                  // 20~30초
      };
      
      const startSpawning = () => {
        const elapsed = GAME_DURATION - timeLeftRef.current;
        const interval = getSpawnInterval(elapsed);
        
        if (holeSpawnRef.current) clearInterval(holeSpawnRef.current);
        
        holeSpawnRef.current = setInterval(() => {
          spawnHole();
        }, interval);
      };

      startSpawning();
      
      const checkInterval = setInterval(() => {
        const elapsed = GAME_DURATION - timeLeftRef.current;
        if (elapsed === 10 || elapsed === 20) {
          startSpawning();
        }
      }, 1000);

      return () => {
        clearInterval(holeSpawnRef.current);
        clearInterval(checkInterval);
      };
    }
  }, [gameState, isPaused, spawnHole]);

  // [불변조건 2] 구멍 없음 상태가 0.8초 이상 지속되지 않도록 강제 (Safety Spawn)
  useEffect(() => {
    if (gameState === 'PLAYING' && !isPaused && holes.length === 0) {
      const timer = setTimeout(() => {
        if (holesRef.current.length === 0) {
          spawnHole();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [gameState, isPaused, holes.length, spawnHole]);

  const handleMaterialSelect = (materialId) => {
    setSelectedMaterial(materialId);
  };

  const addFeedback = (x, y, value, type, icon = null) => {
    setFeedbacks((prev) => [...prev, { id: Date.now(), x, y, value, type, icon }]);
  };

  const handleHoleClick = (hole) => {
    if (!selectedMaterial) return;

    const holeType = HOLE_TYPES.find((t) => t.id === hole.type);
    if (holeType.repair === selectedMaterial) {
      // Success
      const points = holeType.score + combo * 2;
      const newCombo = combo + 1;
      setScore((prev) => prev + points);
      setCombo(newCombo);
      
      setHoles((prev) => prev.filter((h) => h.id !== hole.id));
      setPressure((prev) => Math.max(0, prev - 5));
      setScreenEffect('success');
      
      const materialIcon = MATERIALS.find(m => m.id === selectedMaterial).emoji;
      addFeedback(hole.x, hole.y, `+${points}`, 'success', materialIcon);
      
      setBeaverAction('joy');
      setTimeout(() => setBeaverAction('idle'), 500);
    } else {
      // Failure
      setPressure((prev) => {
        const next = Math.min(MAX_PRESSURE, prev + holeType.pressureInc);
        if (next >= MAX_PRESSURE) {
          endGame();
        }
        return next;
      });
      setCombo(0);
      setScreenEffect('failure');
      addFeedback(hole.x, hole.y, '', 'failure', '❌');
      setBeaverAction('panic');
      setTimeout(() => setBeaverAction('idle'), 500);
    }
    setSelectedMaterial(null);
  };

  return (
    <div className={`app-container effect-${screenEffect} ${pressure > 80 && gameState === 'PLAYING' ? 'tension' : ''} ${combo >= 5 ? 'fever-mode' : ''}`}>
      {gameState === 'PLAYING' && (pressure > 80 || timeLeft <= 15) && (
        <div className="rain-overlay"></div>
      )}
      {gameState === 'COUNTDOWN' && (
        <div className="countdown-overlay">
          <div className="countdown-number">{countdown === 0 ? 'GO!' : countdown}</div>
        </div>
      )}
      {gameState === 'START' && (
        <div className="start-screen">
          <div className="start-header">
            <button className="start-btn-icon" onClick={() => setSoundEnabled(!soundEnabled)}>
              <Emoji symbol={soundEnabled ? '🔊' : '🔇'} />
            </button>
            <button className="start-btn-icon"><Emoji symbol="🏆" /></button>
          </div>
          <div className="bg-clouds">
            <div className="cloud cloud-1"><Emoji symbol="☁️" /></div>
            <div className="cloud cloud-2"><Emoji symbol="☁️" /></div>
            <div className="cloud cloud-3"><Emoji symbol="☁️" /></div>
          </div>
          <div className="start-card">
            <div className="start-beaver">
              <div className="beaver-panic-decor decor-1"><Emoji symbol="💦" /></div>
              <div className="beaver-panic-decor decor-2">!!</div>
              <div className="beaver-logo">
                <img src={beaverImg} alt="beaver" className="beaver-img" />
              </div>
              <div className="dam-plank"></div>
            </div>
            <h1 className="start-title">Beaver Dam Panic</h1>
            <div className="start-rules">
              <div className="step">
                <span className="step-num">1</span>
                <span className="step-icon"><Emoji symbol="🪵" /></span>
                <span className="step-text">재료 선택</span>
              </div>
              <div className="step-arrow"><Emoji symbol="➜" /></div>
              <div className="step">
                <span className="step-num">2</span>
                <span className="step-icon"><Emoji symbol="🕳️" /></span>
                <span className="step-text">구멍 수리!</span>
              </div>
            </div>
            <p className="start-description">
              홍수가 나기 일보직전이에요!<br />
              비버와 함께 서둘러 댐을 수리하세요!
            </p>
            <div className="start-legend">
              <div className="start-pill">
                <div className="mini-hole small"></div>
                <span className="legend-text"><Emoji symbol="🍃" /></span>
              </div>
              <div className="start-pill">
                <div className="mini-hole medium"></div>
                <span className="legend-text"><Emoji symbol="🪵" /></span>
              </div>
              <div className="start-pill">
                <div className="mini-hole large"></div>
                <span className="legend-text"><Emoji symbol="🪨" /></span>
              </div>
            </div>
            <button className="start-button" onClick={startGame}>수리 시작!</button>
          </div>
          <div className="made-by-credit">made in 함수철의 데모공장</div>
        </div>
      )}

      {(gameState === 'PLAYING' || gameState === 'COUNTDOWN') && (
        <div className="screen game-screen">
          <div className="game-hud">
            <div className="hud-stats">
              <div className="hud-item">
                <span className="hud-label">SCORE</span>
                <span className={`hud-value ${score > 0 ? 'score-pop' : ''}`} key={score}>{score}</span>
              </div>
              <div className="hud-item">
                <span className="hud-label">TIME</span>
                <span className={`hud-value ${timeLeft <= 10 ? 'hurry-up-text' : ''}`}>{timeLeft}s</span>
              </div>
            </div>

            <div className="hud-center">
              <div className={`mini-pressure-gauge ${pressure > 80 ? 'danger' : ''}`}>
                <div 
                  className={`pressure-fill ${pressure > 80 ? 'high' : pressure > 50 ? 'mid' : 'low'}`}
                  style={{ width: `${pressure}%` }}
                ></div>
                <span className="pressure-label">PRESSURE</span>
              </div>
            </div>
            
            <div className="hud-actions">
              <div className="mini-equipped">
                <div className={`equipped-box ${selectedMaterial ? 'has-item' : ''}`}>
                  {selectedMaterial ? (
                    <span className="equipped-icon">
                      <Emoji symbol={MATERIALS.find(m => m.id === selectedMaterial).emoji} />
                    </span>
                  ) : <Emoji symbol="🛠️" />}
                </div>
              </div>
              <button className="btn-pause-small" onClick={() => setIsPaused(true)}><Emoji symbol="⏸️" /></button>
            </div>
          </div>

          <div className={`game-board ${pressure > 70 ? 'danger' : ''}`}>
            {showSpeedUpToast && (
              <div className="speed-up-toast">SPEED UP! <Emoji symbol="⚡" /></div>
            )}
            {isPaused && (
              <div className="pause-overlay">
                <div className="pause-card">
                  <h2>잠시 휴식 중!</h2>
                  <p>비버가 숨을 고르고 있어요.</p>
                  <button className="btn-primary" onClick={() => setIsPaused(false)}>계속하기</button>
                </div>
              </div>
            )}
            <div className={`beaver-game-avatar action-${beaverAction} ${pressure > 70 && beaverAction === 'idle' ? 'panic' : ''}`}>
              <img src={beaverImg} alt="beaver" className="beaver-img" />
            </div>
            <div 
              className="water-overlay" 
              style={{ height: `${pressure}%` }}
            >
            </div>
            {holes.map((hole) => (
              <button
                key={hole.id}
                className={`hole hole-${hole.type}`}
                style={{ left: `${hole.x}%`, top: `${hole.y}%` }}
                onClick={() => handleHoleClick(hole)}
              >
                <div className="hole-inner">
                  <Emoji symbol={HOLE_TYPES.find(t => t.id === hole.type).emoji} />
                </div>
              </button>
            ))}
            {feedbacks.map((fb) => (
              <div
                key={fb.id}
                className={`feedback-text feedback-${fb.type}`}
                style={{ left: `${fb.x}%`, top: `${fb.y}%` }}
              >
                {fb.icon && <span className="feedback-icon"><Emoji symbol={fb.icon} /></span>}
                <span className="feedback-val">{fb.value}</span>
              </div>
            ))}
          </div>

          <div className="material-dock">
            {MATERIALS.map((mat) => (
              <button
                key={mat.id}
                className={`dock-item ${selectedMaterial === mat.id ? 'selected' : ''}`}
                onClick={() => handleMaterialSelect(mat.id)}
              >
                <span className="dock-icon"><Emoji symbol={mat.emoji} /></span>
                <span className="dock-label">{mat.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {gameState === 'GAMEOVER' && (
        <div className={`screen result-screen ${pressure >= MAX_PRESSURE ? 'burst' : 'safe'}`}>
          <div className="bg-clouds">
            <div className="cloud cloud-1"><Emoji symbol="☁️" /></div>
            <div className="cloud cloud-2"><Emoji symbol="☁️" /></div>
          </div>
          <div className="result-card">
            {isNewRecord && <div className="new-record-badge">NEW RECORD!</div>}
            
            <h1 className="result-title">
              {pressure >= MAX_PRESSURE ? 'Dam Burst!' : (score >= 600 ? 'Success' : 'Safe!')}
            </h1>

            <div className="star-rating">
              {[1, 2, 3].map((s) => (
                <span 
                  key={s} 
                  className={`star ${s <= stars ? 'active' : ''}`}
                  style={{ animationDelay: `${0.2 + s * 0.1}s` }}
                >
                  <Emoji symbol="⭐" />
                </span>
              ))}
            </div>

            <div className="result-stats">
              <p className="final-score-label">Final Score</p>
              <p className="final-score">{displayedScore}</p>
              <p className="high-score">Best Score: {highScore}</p>
            </div>

            <button className="result-restart-btn" onClick={startGame}>다시 하기</button>
          </div>
        </div>
      )}

      <div className="orientation-overlay">
        <div className="orientation-card">
          <div className="orientation-icon"><Emoji symbol="📱" /></div>
          <p className="orientation-text">댐 수리는 세로 화면에서 가장 안정적이에요!</p>
        </div>
      </div>
    </div>
  );
}

export default App;
