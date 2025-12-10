import React, { useState, useEffect } from 'react';
import posthog from 'posthog-js';
import './App.css';

// Initialize PostHog once
if (typeof window !== 'undefined' && !posthog.__loaded) {
  posthog.init('phc_fwRv0kOBY00zAgocCCyeJZgAxXcPSV64OzuOHenC2jd', {
    api_host: 'https://eu.i.posthog.com',
    ui_host: 'https://eu.posthog.com',
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: true,
    cross_subdomain_cookie: false,
    secure_cookie: false,
    persistence: 'localStorage',
    loaded: (ph) => {
      console.log('PostHog initialized ✓');
    },
    // Disable in development if CORS issues persist
    disable_session_recording: true,
    disable_surveys: true,
  });
}

const UltimateTicTacToe = () => {
  const [boards, setBoards] = useState(Array(9).fill(null).map(() => Array(9).fill(null)));
  const [bigBoard, setBigBoard] = useState(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState('X');
  const [activeBoard, setActiveBoard] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [stats, setStats] = useState({ wins: 0, losses: 0, draws: 0 });
  const [moveCount, setMoveCount] = useState(0);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [lastMove, setLastMove] = useState(null);
  const [showRickRoll, setShowRickRoll] = useState(false);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [rickRollStartTime, setRickRollStartTime] = useState(null);
  const [sessionStartTime] = useState(Date.now());
  const [gamesPlayed, setGamesPlayed] = useState(0);

  const winCombos = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  // Track session on mount
  useEffect(() => {
    // Identify user with PostHog
    const userId = posthog.get_distinct_id();
    posthog.identify(userId);
    
    posthog.capture('session_started', {
      timestamp: new Date().toISOString()
    });

    // Track when user leaves
    const handleBeforeUnload = () => {
      const sessionDuration = Math.round((Date.now() - sessionStartTime) / 1000);
      posthog.capture('session_ended', {
        duration_seconds: sessionDuration,
        games_played: gamesPlayed,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const checkWinner = (board) => {
    for (let combo of winCombos) {
      const [a, b, c] = combo;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    if (board.every(cell => cell !== null)) return 'draw';
    return null;
  };

  useEffect(() => {
    const bigWinner = checkWinner(bigBoard);
    if (bigWinner && !gameOver) {
      setGameOver(true);
      setWinner(bigWinner);
      
      const gameDuration = gameStartTime ? Math.round((Date.now() - gameStartTime) / 1000) : 0;
      
      // Update stats
      const newStats = { ...stats };
      if (bigWinner === 'X') {
        newStats.wins = stats.wins + 1;
      } else if (bigWinner === 'O') {
        newStats.losses = stats.losses + 1;
      } else {
        newStats.draws = stats.draws + 1;
      }
      setStats(newStats);

      // Track game completion with feature flag variant
      let aiVariant = 'default';
      try {
        aiVariant = posthog?.getFeatureFlagPayload?.('ai-thinking-time') || 'default';
      } catch (e) {
        // Feature flag not available
      }
      
      posthog?.capture?.('game_completed', {
        result: bigWinner === 'X' ? 'win' : bigWinner === 'O' ? 'loss' : 'draw',
        moves: moveCount,
        duration_seconds: gameDuration,
        moves_per_minute: gameDuration > 0 ? Math.round((moveCount / gameDuration) * 60) : 0,
        total_games_played: gamesPlayed + 1,
        win_streak: bigWinner === 'X' ? newStats.wins : 0,
        board_positions_used: bigBoard.filter(b => b !== null).length,
        ai_thinking_variant: aiVariant
      });

      setGamesPlayed(prev => prev + 1);
    }
  }, [bigBoard]);

  useEffect(() => {
    if (currentPlayer === 'O' && !gameOver) {
      setIsAiThinking(true);
      
      // Get AI thinking time from feature flag (with fallback)
      let aiThinkingTime = 600; // default
      try {
        const flagValue = posthog?.getFeatureFlagPayload?.('ai-thinking-time');
        if (flagValue) {
          aiThinkingTime = Number(flagValue);
        }
      } catch (e) {
        console.log('Feature flag not ready yet, using default');
      }
      
      setTimeout(() => {
        makeAiMove();
        setIsAiThinking(false);
      }, aiThinkingTime);
    }
  }, [currentPlayer, gameOver]);

  const makeAiMove = () => {
    let validBoards = [];
    if (activeBoard !== null && bigBoard[activeBoard] === null) {
      validBoards = [activeBoard];
    } else {
      validBoards = bigBoard.map((v, i) => v === null ? i : null).filter(i => i !== null);
    }

    let bestMove = null;

    // 1. Try to win on big board
    for (let boardIdx of validBoards) {
      for (let cellIdx = 0; cellIdx < 9; cellIdx++) {
        if (!boards[boardIdx][cellIdx]) {
          // Simulate winning this small board
          const testBoards = boards.map(b => [...b]);
          testBoards[boardIdx][cellIdx] = 'O';
          
          if (checkWinner(testBoards[boardIdx]) === 'O') {
            // Check if this wins the big board
            const testBigBoard = [...bigBoard];
            testBigBoard[boardIdx] = 'O';
            if (checkWinner(testBigBoard) === 'O') {
              bestMove = { boardIdx, cellIdx };
              break;
            }
          }
        }
      }
      if (bestMove) break;
    }

    // 2. Block player from winning big board
    if (!bestMove) {
      for (let boardIdx of validBoards) {
        for (let cellIdx = 0; cellIdx < 9; cellIdx++) {
          if (!boards[boardIdx][cellIdx]) {
            const testBoards = boards.map(b => [...b]);
            testBoards[boardIdx][cellIdx] = 'X';
            
            if (checkWinner(testBoards[boardIdx]) === 'X') {
              const testBigBoard = [...bigBoard];
              testBigBoard[boardIdx] = 'X';
              if (checkWinner(testBigBoard) === 'X') {
                bestMove = { boardIdx, cellIdx };
                break;
              }
            }
          }
        }
        if (bestMove) break;
      }
    }

    // 3. Try to win small board
    if (!bestMove) {
      for (let boardIdx of validBoards) {
        const board = boards[boardIdx];
        for (let i = 0; i < 9; i++) {
          if (!board[i]) {
            const testBoard = [...board];
            testBoard[i] = 'O';
            if (checkWinner(testBoard) === 'O') {
              bestMove = { boardIdx, cellIdx: i };
              break;
            }
          }
        }
        if (bestMove) break;
      }
    }

    // 4. Block player from winning small board
    if (!bestMove) {
      for (let boardIdx of validBoards) {
        const board = boards[boardIdx];
        for (let i = 0; i < 9; i++) {
          if (!board[i]) {
            const testBoard = [...board];
            testBoard[i] = 'X';
            if (checkWinner(testBoard) === 'X') {
              bestMove = { boardIdx, cellIdx: i };
              break;
            }
          }
        }
        if (bestMove) break;
      }
    }

    // 5. Strategic positioning
    if (!bestMove) {
      const randomBoard = validBoards[Math.floor(Math.random() * validBoards.length)];
      const board = boards[randomBoard];
      const emptyCells = board.map((cell, i) => cell === null ? i : null).filter(i => i !== null);
      
      // Prioritize center and corners
      const priorityMoves = [4, 0, 2, 6, 8, 1, 3, 5, 7];
      for (let move of priorityMoves) {
        if (emptyCells.includes(move)) {
          bestMove = { boardIdx: randomBoard, cellIdx: move };
          break;
        }
      }
      
      if (!bestMove && emptyCells.length > 0) {
        const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        bestMove = { boardIdx: randomBoard, cellIdx: randomCell };
      }
    }

    if (bestMove) {
      handleMove(bestMove.boardIdx, bestMove.cellIdx);
    }
  };

  const handleMove = (boardIdx, cellIdx) => {
    if (gameOver || bigBoard[boardIdx] !== null || boards[boardIdx][cellIdx] !== null) return;
    
    if (activeBoard !== null && activeBoard !== boardIdx && bigBoard[activeBoard] === null) return;

    const moveStartTime = Date.now();

    const newBoards = boards.map((board, i) => 
      i === boardIdx ? board.map((cell, j) => j === cellIdx ? currentPlayer : cell) : board
    );
    setBoards(newBoards);
    setLastMove({ boardIdx, cellIdx });
    setMoveCount(prev => prev + 1);

    // Track move
    posthog.capture('move_made', {
      player: currentPlayer,
      board_index: boardIdx,
      cell_index: cellIdx,
      move_number: moveCount + 1,
      board_was_active: activeBoard === boardIdx || activeBoard === null
    });

    const smallWinner = checkWinner(newBoards[boardIdx]);
    if (smallWinner) {
      const newBigBoard = [...bigBoard];
      newBigBoard[boardIdx] = smallWinner === 'draw' ? 'draw' : smallWinner;
      setBigBoard(newBigBoard);

      // Track board completion
      posthog.capture('board_completed', {
        board_index: boardIdx,
        winner: smallWinner,
        moves_to_complete: moveCount + 1
      });
    }

    const nextBoard = bigBoard[cellIdx] === null ? cellIdx : null;
    setActiveBoard(nextBoard);
    setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X');
  };

  const resetGame = () => {
    // Track game abandonment if not finished
    if (!gameOver && moveCount > 0) {
      const gameDuration = gameStartTime ? Math.round((Date.now() - gameStartTime) / 1000) : 0;
      posthog.capture('game_abandoned', {
        moves_made: moveCount,
        duration_seconds: gameDuration,
        boards_completed: bigBoard.filter(b => b !== null).length
      });
    }

    setBoards(Array(9).fill(null).map(() => Array(9).fill(null)));
    setBigBoard(Array(9).fill(null));
    setCurrentPlayer('X');
    setActiveBoard(null);
    setGameOver(false);
    setWinner(null);
    setMoveCount(0);
    setLastMove(null);
    setGameStartTime(Date.now());

    posthog.capture('game_started', {
      game_number: gamesPlayed + 1,
      current_win_streak: stats.wins
    });
  };

  const handleRickRollClick = () => {
    setShowRickRoll(true);
    setRickRollStartTime(Date.now());
    
    posthog.capture('rickroll_clicked', {
      games_played: gamesPlayed,
      current_wins: stats.wins
    });
  };

  const handleRickRollClose = () => {
    const watchDuration = rickRollStartTime ? Math.round((Date.now() - rickRollStartTime) / 1000) : 0;
    
    posthog.capture('rickroll_closed', {
      watch_duration_seconds: watchDuration
    });
    
    setShowRickRoll(false);
  };

  const renderSmallBoard = (boardIdx) => {
    const isActive = activeBoard === null ? bigBoard[boardIdx] === null : activeBoard === boardIdx;
    const board = boards[boardIdx];
    const boardWinner = bigBoard[boardIdx];
    
    return (
      <div 
        key={boardIdx}
        className={`small-board ${isActive && !gameOver ? 'active' : ''} ${boardWinner ? 'won' : ''}`}
      >
        {boardWinner && boardWinner !== 'draw' && (
          <div className="board-winner-overlay">
            {boardWinner === 'X' ? (
              <div className="winner-x">
                <div className="x-line x-line-1"></div>
                <div className="x-line x-line-2"></div>
              </div>
            ) : (
              <div className="winner-o"></div>
            )}
          </div>
        )}
        
        <div className="cell-grid">
          {board.map((cell, cellIdx) => {
            const isLastMove = lastMove?.boardIdx === boardIdx && lastMove?.cellIdx === cellIdx;
            
            return (
              <button
                key={cellIdx}
                onClick={() => currentPlayer === 'X' && handleMove(boardIdx, cellIdx)}
                disabled={currentPlayer === 'O' || gameOver}
                className={`cell ${isLastMove ? 'last-move' : ''}`}
              >
                {cell === 'X' && (
                  <div className="mark-x">
                    <div className="x-line x-line-1"></div>
                    <div className="x-line x-line-2"></div>
                  </div>
                )}
                {cell === 'O' && <div className="mark-o"></div>}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (showRickRoll) {
    return (
      <div className="rickroll-container">
        <button 
          className="close-rickroll-btn"
          onClick={handleRickRollClose}
          title="Close"
        >
          ✕
        </button>
        <iframe
          width="100%"
          height="100%"
          src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
          title="You shouldn't have clicked that..."
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      </div>
    );
  }

  return (
    <div className="game-container">
      <button 
        className="dont-click-btn"
        onClick={handleRickRollClick}
      >
        don't click
      </button>

      <div className="header">
        <div className="title-row">
          <h1>Ultimate Tic-Tac-Toe</h1>
        </div>
        <p className="subtitle">
          {gameOver ? 'Game Over!' : activeBoard !== null ? 'Play in the highlighted board' : 'Play in any available board'}
        </p>
        <p className="rules">Win 3 small boards in a row to win the game</p>
      </div>

      <div className="stats">
        <div className="stat">
          <span>W: {stats.wins}</span>
        </div>
        <span className="stat-divider">|</span>
        <span>L: {stats.losses}</span>
        <span className="stat-divider">|</span>
        <span>D: {stats.draws}</span>
      </div>

      <div className="board-container">
        <div className="big-board">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(renderSmallBoard)}
        </div>
      </div>

      {!gameOver && (
        <div className="status">
          <div className={`status-indicator ${isAiThinking ? 'thinking' : ''}`}></div>
          <span>{isAiThinking ? 'AI thinking...' : currentPlayer === 'X' ? 'Your turn' : 'AI turn'}</span>
        </div>
      )}

      {gameOver && (
        <div className="game-over">
          {winner === 'X' ? 'You Win!' : winner === 'O' ? 'AI Wins!' : 'Draw!'}
        </div>
      )}

      <div className="controls">
        <button onClick={resetGame} className="btn btn-secondary">
          <span className="btn-icon">↻</span>
          New Game
        </button>
      </div>
    </div>
  );
};

export default UltimateTicTacToe;