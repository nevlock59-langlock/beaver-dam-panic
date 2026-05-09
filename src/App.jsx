import { useState, useEffect, useCallback, useRef } from 'react';
import twemoji from 'twemoji';
import beaverImg from './assets/beaver.png';
import './App.css';

const MAX_PRESSURE = 100;

const MODE_CONFIG = {
  EASY: {
    duration: 30,
    scoreMultiplier: 1,
    starThresholds: [10, 20, 30],
    successMessage: "30초 동안 댐을 지켜냈어요! 더 높은 점수에 도전해보세요.",
    criteriaText: "Stars: 10s / 20s / 30s",
  },
  HARD: {
    duration: 60,
    scoreMultiplier: 1.3,
    starThresholds: [20, 40, 60],
    successMessage: "60초 동안 댐을 지켜냈어요! 진짜 댐 수리 장인이에요!",
    criteriaText: "Stars: 20s / 40s / 60s",
  }
};

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
  const [gameMode, setGameMode] = useState('EASY');
  const [score, setScore] = useState(0);
  const [highScores, setHighScores] = useState(() => {
    const easy = Number(localStorage.getItem('beaver-high-score-easy')) || Number(localStorage.getItem('beaver-high-score')) || 0;
    const hard = Number(localStorage.getItem('beaver-high-score-hard')) || 0;
    return { EASY: easy, HARD: hard };
  });
  const [timeLeft, setTimeLeft] = useState(MODE_CONFIG.EASY.duration);
  const [pressure, setPressure] = useState(0);
  const [holes, setHoles] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [showHoleHint, setShowHoleHint] = useState(false);
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
  const [showTutorial, setShowTutorial] = useState(false);
  const [showInGameTutorial, setShowInGameTutorial] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showRecords, setShowRecords] = useState(false);
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem('beaver-best-score')) || 0);
  const [bestScoreMode, setBestScoreMode] = useState(() => localStorage.getItem('beaver-best-score-mode') || '');

  const gameLoopRef = useRef(null);
  const holeSpawnRef = useRef(null);
  const holesRef = useRef([]);
  const timeLeftRef = useRef(MODE_CONFIG.EASY.duration);
  const gameModeRef = useRef('EASY');
  const holeHintDelayTimerRef = useRef(null);
  const holeHintHideTimerRef = useRef(null);

  // Sync refs with state for use in intervals without re-triggering them
  const finishIngameTutorial = () => {
    localStorage.setItem('beaverIngameGuideSeen', 'true');
    setShowInGameTutorial(false);
    setGameState('COUNTDOWN');
  };

  useEffect(() => {
    holesRef.current = holes;
  }, [holes]);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);

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
    const config = MODE_CONFIG[gameMode];
    setScore(0);
    setTimeLeft(config.duration);
    timeLeftRef.current = config.duration;
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
    setGameState('TUTORIAL');
    setCountdown(null);
    setShowSpeedUpToast(false);
    setShowInGameTutorial(true);
    setShowHelpModal(false);
  };

  useEffect(() => {
    if (gameState === 'TUTORIAL') {
      const hasSeenGuide = localStorage.getItem('beaverIngameGuideSeen') === 'true';

      if (!hasSeenGuide) return;

      const timer = setTimeout(() => {
        setShowInGameTutorial(false);
        setGameState('COUNTDOWN');
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [gameState, spawnHole]);

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
          setShowInGameTutorial(true);
          setTimeout(() => {
            setShowInGameTutorial(false);
          }, 2000);
        }, 400); // 0.3~0.5초 사이 첫 구멍 생성
        return () => clearTimeout(timer);
      }
    }
  }, [gameState, countdown, spawnHole]);

  const endGame = useCallback(() => {
    const currentMode = gameModeRef.current;
    const config = MODE_CONFIG[currentMode];
    const highScore = highScores[currentMode];
    const newRecord = score > highScore;
    const survivalTime = config.duration - timeLeftRef.current;

    let earnedStars = 0;
    if (pressure < MAX_PRESSURE || survivalTime >= config.starThresholds[2]) earnedStars = 3;
    else if (survivalTime >= config.starThresholds[1]) earnedStars = 2;
    else if (survivalTime >= config.starThresholds[0]) earnedStars = 1;

    setTimeout(() => {
      setGameState('GAMEOVER');
      setDisplayedScore(0);
      setStars(earnedStars);
      if (newRecord) setIsNewRecord(true);
    }, 1500);

    if (newRecord) {
      setHighScores(prev => {
        const updated = { ...prev, [currentMode]: score };
        localStorage.setItem(`beaver-high-score-${currentMode.toLowerCase()}`, score.toString());
        // For legacy compatibility, also update 'beaver-high-score' if it was Easy mode
        if (currentMode === 'EASY') localStorage.setItem('beaver-high-score', score.toString());
        return updated;
      });
    }

    // Update all-time best
    if (score > bestScore) {
      setBestScore(score);
      setBestScoreMode(currentMode);
      localStorage.setItem('beaver-best-score', score.toString());
      localStorage.setItem('beaver-best-score-mode', currentMode);
    }
  }, [score, highScores, pressure, bestScore]);

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
      const config = MODE_CONFIG[gameModeRef.current];
      const duration = config.duration;

      gameLoopRef.current = setInterval(() => {
        // Time update
        setTimeLeft((prev) => {
          const next = prev - 1;
          const elapsed = duration - next;

          // Speed up toast: halfway through the last stage
          // For Easy(30s): elapsed is 20 (next is 10)
          // For Hard(60s): elapsed is 40 (next is 20)
          if (next === Math.floor(duration / 3)) {
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
          const currentTimeLeft = timeLeftRef.current;
          const elapsed = duration - currentTimeLeft;

          // [불변조건 1] 구멍이 없으면 압력은 절대 증가하지 않는다.
          if (!currentHoles || currentHoles.length === 0) {
            return prev;
          }

          // 기본 상승폭: 구멍이 있을 때만 의미 있게 상승
          let increment = 1.5; 

          // 시간 경과에 따른 가속 (전체 시간 대비 비율로 계산하여 난이도 곡선 유지)
          if (elapsed >= duration * 0.66) increment += 2.0; 
          else if (elapsed >= duration * 0.33) increment += 1.0;

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
      const config = MODE_CONFIG[gameModeRef.current];
      const duration = config.duration;

      const getSpawnInterval = (elapsed) => {
        if (elapsed < duration * 0.33) return 1400; // 1단계
        if (elapsed < duration * 0.66) return 1100; // 2단계
        return 900;                  // 3단계
      };

      const startSpawning = () => {
        const elapsed = duration - timeLeftRef.current;
        const interval = getSpawnInterval(elapsed);

        if (holeSpawnRef.current) clearInterval(holeSpawnRef.current);

        holeSpawnRef.current = setInterval(() => {
          spawnHole();
        }, interval);
      };

      startSpawning();

      const checkInterval = setInterval(() => {
        const elapsed = duration - timeLeftRef.current;
        // Check for phase transitions (10/20 for Easy, 20/40 for Hard)
        const phase1 = Math.floor(duration * 0.33);
        const phase2 = Math.floor(duration * 0.66);
        if (elapsed === phase1 || elapsed === phase2) {
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
    setShowHoleHint(false);

    if (holeHintDelayTimerRef.current) clearTimeout(holeHintDelayTimerRef.current);
    if (holeHintHideTimerRef.current) clearTimeout(holeHintHideTimerRef.current);

    holeHintDelayTimerRef.current = setTimeout(() => {
      setShowHoleHint(true);

      holeHintHideTimerRef.current = setTimeout(() => {
        setShowHoleHint(false);
      }, 3000);
    }, 1000);
  };

  const addFeedback = (x, y, value, type, icon = null) => {
    setFeedbacks((prev) => [...prev, { id: Date.now(), x, y, value, type, icon }]);
  };

  const handleHoleClick = (hole) => {
    if (!selectedMaterial) return;

    setShowHoleHint(false);
    if (holeHintDelayTimerRef.current) clearTimeout(holeHintDelayTimerRef.current);
    if (holeHintHideTimerRef.current) clearTimeout(holeHintHideTimerRef.current);

    const config = MODE_CONFIG[gameModeRef.current];
    const holeType = HOLE_TYPES.find((t) => t.id === hole.type);
    if (holeType.repair === selectedMaterial) {
      // Success
      const comboBonus = Math.min(combo, 20) * 2;
      const basePoints = holeType.score + comboBonus;
      const points = Math.round(basePoints * config.scoreMultiplier);
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

  const openHelp = () => {
    setIsPaused(true);
    setShowHelpModal(true);
  };

  const closeHelp = () => {
    setIsPaused(false);
    setShowHelpModal(false);
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
            <button 
              className="start-btn-icon btn-how-to" 
              onClick={() => setShowTutorial(true)}
              title="How to Play"
            >
              <Emoji symbol="❓" />
            </button>
            <button className="start-btn-icon" onClick={() => setSoundEnabled(!soundEnabled)}>
              <Emoji symbol={soundEnabled ? '🔊' : '🔇'} />
            </button>
            <button className="start-btn-icon" onClick={() => setShowRecords(true)}>
              <Emoji symbol="🏆" />
            </button>
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

            <div className="start-legend">
              <div className="start-pill">
                <span className="legend-text">
                  <Emoji symbol="🍃" />
                  <span className="legend-arrow">→</span>
                  <Emoji symbol="💧" />
                </span>
              </div>
              <div className="start-pill">
                <span className="legend-text">
                  <Emoji symbol="🪵" />
                  <span className="legend-arrow">→</span>
                  <Emoji symbol="🌊" />
                </span>
              </div>
              <div className="start-pill">
                <span className="legend-text">
                  <Emoji symbol="🪨" />
                  <span className="legend-arrow">→</span>
                  <Emoji symbol="🌋" />
                </span>
              </div>
            </div>

            <div className="mode-selection">
              <button 
                className={`mode-btn ${gameMode === 'EASY' ? 'active' : ''}`}
                onClick={() => {
                  setGameMode('EASY');
                  setTimeLeft(MODE_CONFIG.EASY.duration);
                }}
              >
                EASY
              </button>
              <button 
                className={`mode-btn ${gameMode === 'HARD' ? 'active' : ''}`}
                onClick={() => {
                  setGameMode('HARD');
                  setTimeLeft(MODE_CONFIG.HARD.duration);
                }}
              >
                HARD
              </button>
            </div>

            <button className="start-button" onClick={startGame}>수리 시작!</button>
          </div>
          <div className="made-by-credit">made in 함수철의 데모공장</div>

          {showTutorial && (
            <div className="tutorial-overlay" onClick={() => setShowTutorial(false)}>
              <div className="tutorial-card" onClick={(e) => e.stopPropagation()}>
                <button className="tutorial-close" onClick={() => setShowTutorial(false)}>
                  <Emoji symbol="❌" />
                </button>
                <h2 className="tutorial-title">How to Play</h2>
                <div className="tutorial-content">
                  <div className="tutorial-item">
                    <div className="tutorial-icon"><Emoji symbol="🛠️" /></div>
                    <div className="tutorial-text">
                      <strong>재료를 골라 댐의 틈을 막으세요</strong>
                      <p>구멍 크기에 맞는 재료(잎, 나무, 돌)를 선택해 클릭하세요.</p>
                    </div>
                  </div>
                  <div className="tutorial-item">
                    <div className="tutorial-icon"><Emoji symbol="🌊" /></div>
                    <div className="tutorial-text">
                      <strong>시간이 지날수록 물살이 강해져요</strong>
                      <p>수압이 100%가 되면 댐이 무너지니 주의하세요!</p>
                    </div>
                  </div>
                  <div className="tutorial-item">
                    <div className="tutorial-icon"><Emoji symbol="🏁" /></div>
                    <div className="tutorial-text">
                      <strong>끝까지 버티면 성공!</strong>
                      <p>Easy는 30초, Hard는 60초 동안 댐을 지키면 승리합니다.</p>
                    </div>
                  </div>
                </div>
                <button className="tutorial-start-btn" onClick={() => setShowTutorial(false)}>
                  알겠어요!
                </button>
              </div>
            </div>
          )}

          {showRecords && (
            <div className="tutorial-overlay" onClick={() => setShowRecords(false)}>
              <div className="tutorial-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                <button className="tutorial-close" onClick={() => setShowRecords(false)}>
                  <Emoji symbol="❌" />
                </button>
                <h2 className="tutorial-title">🏆 Best Record</h2>
                <div className="tutorial-content" style={{ textAlign: 'center', margin: '20px 0' }}>
                  {bestScore > 0 ? (
                    <>
                      <div className="final-score" style={{ fontSize: '3.5rem', margin: '10px 0' }}>{bestScore}</div>
                      <div className="result-mode-badge" style={{ position: 'static', marginBottom: '10px', display: 'inline-block' }}>
                        {bestScoreMode} MODE
                      </div>
                    </>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontWeight: 600, padding: '20px 0' }}>
                      <p>아직 기록이 없어요!</p>
                      <p>첫 댐 수리에 도전해보세요.</p>
                    </div>
                  )}
                </div>
                <button className="tutorial-start-btn" onClick={() => setShowRecords(false)}>
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(gameState === 'PLAYING' || gameState === 'COUNTDOWN' || gameState === 'TUTORIAL') && (
        <div className="screen game-screen">
          <div className="game-hud">
            <div className="hud-stats">
              <div className="hud-mode-tag">{gameMode}</div>
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
              <div className="hud-btn-group">
                <button className="btn-hud-small" onClick={openHelp}><Emoji symbol="❓" /></button>
                <button className="btn-hud-small" onClick={() => setIsPaused(true)}><Emoji symbol="⏸️" /></button>
              </div>
            </div>
          </div>

          <div className={`game-board ${pressure > 70 ? 'danger' : ''}`}>
            {showInGameTutorial && (
              <div className="ingame-tutorial-overlay">
                <div className="ingame-tutorial-card">
                  <p className="ingame-tutorial-text">맞는 재료 선택 → 구멍 탭!</p>
                  <div className="ingame-tutorial-rules">
                    <div className="tutorial-pill"><Emoji symbol="🍃" /> <span className="legend-arrow">→</span> <Emoji symbol="💧" /></div>
                    <div className="tutorial-pill"><Emoji symbol="🪵" /> <span className="legend-arrow">→</span> <Emoji symbol="🌊" /></div>
                    <div className="tutorial-pill"><Emoji symbol="🪨" /> <span className="legend-arrow">→</span> <Emoji symbol="🌋" /></div>
                  </div>
              <button
                className="ingame-tutorial-start-btn"
                onClick={finishIngameTutorial}
              >
                알겠어! 시작하기
              </button>
                </div>
              </div>
            )}
            {showHelpModal && (
              <div className="tutorial-overlay">
                <div className="ingame-tutorial-card">
                  <p className="ingame-tutorial-text">맞는 재료 선택 → 구멍 탭!</p>
                  <div className="ingame-tutorial-rules">
                    <div className="tutorial-pill"><Emoji symbol="🍃" /> <span className="legend-arrow">→</span> <Emoji symbol="💧" /></div>
                    <div className="tutorial-pill"><Emoji symbol="🪵" /> <span className="legend-arrow">→</span> <Emoji symbol="🌊" /></div>
                    <div className="tutorial-pill"><Emoji symbol="🪨" /> <span className="legend-arrow">→</span> <Emoji symbol="🌋" /></div>
                  </div>
                  <button className="btn-resume" style={{ marginTop: '20px' }} onClick={closeHelp}>계속하기</button>
                </div>
              </div>
            )}
            {showSpeedUpToast && (
              <div className="speed-up-toast">SPEED UP! <Emoji symbol="⚡" /></div>
            )}
            {isPaused && !showHelpModal && (
              <div className="pause-overlay">
                <div className="pause-card">
                  <h2>잠시 휴식 중!</h2>
                  <p>비버가 숨을 고르고 있어요.</p>
                  <button className="btn-resume" onClick={() => setIsPaused(false)}>계속하기</button>
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
                className={`hole hole-${hole.type} ${
                  showHoleHint &&
                  selectedMaterial &&
                  HOLE_TYPES.find((t) => t.id === hole.type)?.repair === selectedMaterial
                    ? 'hole-hint'
                    : ''
                }`}
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
                  <div className="result-mode-badge">{gameMode} MODE</div>

                  <h1 className="result-title">
                  {pressure >= MAX_PRESSURE ? 'Dam Burst!' : (score >= (gameMode === 'EASY' ? 600 : 1200) ? 'Success' : 'Safe!')}
                  </h1>

                  <p className="result-feedback">
                  {pressure >= MAX_PRESSURE
                  ? "댐이 무너졌어요! 구멍 크기에 맞는 재료를 더 빠르게 골라보세요."
                  : MODE_CONFIG[gameMode].successMessage}
                  </p>

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
                  <p className="high-score">Best Score: {isNewRecord ? score : highScores[gameMode]}</p>
                  </div>
            <div className="star-criteria">{MODE_CONFIG[gameMode].criteriaText}</div>

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
