import React, { useState, useEffect } from 'react';
import posthog from 'posthog-js';
import './App.css';

// Initialize PostHog once
if (typeof window !== 'undefined' && !posthog.__loaded) {
  console.log('Attempting to initialize PostHog...');
  try {
    posthog.init('phc_fwRv0kOBY00zAgocCCyeJZgAxXcPSV64OzuOHenC2jd', {
      api_host: 'https://eu.i.posthog.com',
      ui_host: 'https://eu.posthog.com',
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: true,
      cross_subdomain_cookie: false,
      secure_cookie: window.location.protocol === 'https:',
      persistence: 'localStorage',
      loaded: (ph) => {
        console.log('PostHog initialized successfully ✓');
      },
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
        recordCanvas: false,
        recordCrossOriginIframes: false,
        sampling: {
          minimumDuration: 0
        }
      },
      disable_surveys: true,
      capture_dead_clicks: true,
      capture_performance: true,
    });
    
    window.addEventListener('error', (event) => {
      posthog?.capture?.('javascript_error', {
        error_message: event.message,
        error_source: event.filename,
        error_line: event.lineno,
        error_column: event.colno,
        error_stack: event.error?.stack,
        page_url: window.location.href
      });
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      posthog?.capture?.('unhandled_promise_rejection', {
        error_message: event.reason?.message || String(event.reason),
        error_stack: event.reason?.stack,
        page_url: window.location.href
      });
    });
    
  } catch (error) {
    console.error('PostHog initialization error:', error);
  }
}

// =============================================================================
// REBALANCED AI - FAIR DIFFICULTY
// =============================================================================
// MAJOR CHANGES:
// 1. AI IGNORES where it sends you (no more "trap" optimization)
// 2. AI focuses purely on winning boards and blocking you
// 3. Higher base mistake rate for fairness
// 4. Depth reduced slightly for less perfect play
// =============================================================================

const WEIGHTS = {
  // Meta-game (winning the big board)
  meta_win: 100000,
  meta_two_in_row: 800,
  meta_block_two_in_row: 700,
  
  // Board position values
  meta_center: 300,
  meta_corner: 150,
  meta_edge: 80,
  
  // Local board evaluation
  local_win: 250,
  local_two_in_row: 30,
  local_block_two_in_row: 25,
  local_center: 15,
  local_corner: 8,
  
  // REMOVED/ZEROED: Next-board manipulation
  // The AI no longer tries to send you to bad boards
  send_to_won_board: 0,        // Was 100 - now AI doesn't care
  send_to_favorable_board: 0,  // Was 40 - now AI doesn't care
  send_to_unfavorable_board: 0, // Was -30 - now AI doesn't care
  
  // Strategic depth
  fork_threat: 400,
};

const BOARD_IMPORTANCE = {
  4: 1.4,    // Center
  0: 1.15, 2: 1.15, 6: 1.15, 8: 1.15,  // Corners
  1: 1.0, 3: 1.0, 5: 1.0, 7: 1.0       // Edges
};

// Load saved game state from localStorage
const loadGameState = () => {
  try {
    const saved = localStorage.getItem('ultimateTicTacToe');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.log('Could not load saved game:', e);
  }
  return null;
};

const UltimateTicTacToe = () => {
  const savedState = loadGameState();
  
  const [boards, setBoards] = useState(savedState?.boards || Array(9).fill(null).map(() => Array(9).fill(null)));
  const [bigBoard, setBigBoard] = useState(savedState?.bigBoard || Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState(savedState?.currentPlayer || 'X');
  const [activeBoard, setActiveBoard] = useState(savedState?.activeBoard ?? null);
  const [gameOver, setGameOver] = useState(savedState?.gameOver || false);
  const [winner, setWinner] = useState(savedState?.winner || null);
  const [stats, setStats] = useState(savedState?.stats || { wins: 0, losses: 0, draws: 0 });
  const [moveCount, setMoveCount] = useState(savedState?.moveCount || 0);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [lastMove, setLastMove] = useState(savedState?.lastMove || null);
  const [showRickRoll, setShowRickRoll] = useState(false);
  const [gameStartTime, setGameStartTime] = useState(savedState?.gameStartTime || Date.now());
  const [rickRollStartTime, setRickRollStartTime] = useState(null);
  const [sessionStartTime] = useState(Date.now());
  const [gamesPlayed, setGamesPlayed] = useState(savedState?.gamesPlayed || 0);
  const [aiMistakeRate, setAiMistakeRate] = useState(savedState?.aiMistakeRate || 0.15);
  const [hasError, setHasError] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(true);
  const [justWonBoard, setJustWonBoard] = useState(null); // Track which board just got won for animation

  useEffect(() => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }, []);

  // Save game state to localStorage whenever relevant state changes
  useEffect(() => {
    const gameState = {
      boards,
      bigBoard,
      currentPlayer,
      activeBoard,
      gameOver,
      winner,
      stats,
      moveCount,
      lastMove,
      gameStartTime,
      gamesPlayed,
      aiMistakeRate
    };
    try {
      localStorage.setItem('ultimateTicTacToe', JSON.stringify(gameState));
    } catch (e) {
      console.log('Could not save game state:', e);
    }
  }, [boards, bigBoard, currentPlayer, activeBoard, gameOver, winner, stats, moveCount, lastMove, gamesPlayed, aiMistakeRate]);

  // Clear justWonBoard animation after delay
  useEffect(() => {
    if (justWonBoard !== null) {
      const timer = setTimeout(() => setJustWonBoard(null), 400);
      return () => clearTimeout(timer);
    }
  }, [justWonBoard]);

  const winCombos = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

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

  const countTwoInRows = (board, player) => {
    let count = 0;
    for (let combo of winCombos) {
      const [a, b, c] = combo;
      const cells = [board[a], board[b], board[c]];
      const playerCells = cells.filter(cell => cell === player).length;
      const emptyCells = cells.filter(cell => cell === null).length;
      if (playerCells === 2 && emptyCells === 1) count++;
    }
    return count;
  };

  const evaluateLocalBoard = (board, player, boardIdx) => {
    const opponent = player === 'X' ? 'O' : 'X';
    let score = 0;
    const importance = BOARD_IMPORTANCE[boardIdx] || 1.0;

    const winner = checkWinner(board);
    if (winner === player) return WEIGHTS.local_win * importance;
    if (winner === opponent) return -WEIGHTS.local_win * importance;
    if (winner === 'draw') return 0;

    // Two-in-a-row threats
    score += countTwoInRows(board, player) * WEIGHTS.local_two_in_row;
    score -= countTwoInRows(board, opponent) * WEIGHTS.local_block_two_in_row;

    // Position control
    if (board[4] === player) score += WEIGHTS.local_center;
    if (board[4] === opponent) score -= WEIGHTS.local_center;

    for (let corner of [0, 2, 6, 8]) {
      if (board[corner] === player) score += WEIGHTS.local_corner;
      if (board[corner] === opponent) score -= WEIGHTS.local_corner;
    }

    return score * importance;
  };

  // SIMPLIFIED: No longer considers where opponent is sent
  const evaluateGameState = (gameBoards, gameBigBoard, player) => {
    const opponent = player === 'X' ? 'O' : 'X';
    let score = 0;

    const metaWinner = checkWinner(gameBigBoard);
    if (metaWinner === player) return WEIGHTS.meta_win;
    if (metaWinner === opponent) return -WEIGHTS.meta_win;

    // Meta-game threats
    const playerMetaThreats = countTwoInRows(gameBigBoard, player);
    const opponentMetaThreats = countTwoInRows(gameBigBoard, opponent);
    
    score += playerMetaThreats * WEIGHTS.meta_two_in_row;
    score -= opponentMetaThreats * WEIGHTS.meta_block_two_in_row;
    
    // Fork bonus
    if (playerMetaThreats >= 2) score += WEIGHTS.fork_threat;
    if (opponentMetaThreats >= 2) score -= WEIGHTS.fork_threat;

    // Board position values
    for (let i = 0; i < 9; i++) {
      if (gameBigBoard[i] === player) {
        if (i === 4) score += WEIGHTS.meta_center;
        else if ([0, 2, 6, 8].includes(i)) score += WEIGHTS.meta_corner;
        else score += WEIGHTS.meta_edge;
      } else if (gameBigBoard[i] === opponent) {
        if (i === 4) score -= WEIGHTS.meta_center;
        else if ([0, 2, 6, 8].includes(i)) score -= WEIGHTS.meta_corner;
        else score -= WEIGHTS.meta_edge;
      }
    }

    // Evaluate local boards
    for (let i = 0; i < 9; i++) {
      if (gameBigBoard[i] === null) {
        score += evaluateLocalBoard(gameBoards[i], player, i);
      }
    }

    return score;
  };

  const getValidMoves = (gameBoards, gameBigBoard, constraintBoard) => {
    const moves = [];
    const boardsToCheck = constraintBoard !== null && gameBigBoard[constraintBoard] === null
      ? [constraintBoard]
      : gameBigBoard.map((val, idx) => val === null ? idx : null).filter(idx => idx !== null);

    for (let boardIdx of boardsToCheck) {
      for (let cellIdx = 0; cellIdx < 9; cellIdx++) {
        if (gameBoards[boardIdx][cellIdx] === null) {
          moves.push({ boardIdx, cellIdx });
        }
      }
    }
    return moves;
  };

  const applyMoveToState = (gameBoards, gameBigBoard, move, player) => {
    const newBoards = gameBoards.map((board, i) =>
      i === move.boardIdx ? board.map((cell, j) => j === move.cellIdx ? player : cell) : [...board]
    );
    const newBigBoard = [...gameBigBoard];
    
    const boardWinner = checkWinner(newBoards[move.boardIdx]);
    if (boardWinner && boardWinner !== 'draw') {
      newBigBoard[move.boardIdx] = boardWinner;
    } else if (boardWinner === 'draw') {
      newBigBoard[move.boardIdx] = 'draw';
    }

    // Random next board for AI simulation too (fairness)
    const availableBoards = newBigBoard
      .map((val, idx) => val === null ? idx : null)
      .filter(idx => idx !== null);
    
    let nextBoard = null;
    if (availableBoards.length > 0 && Math.random() < 0.7) {
      nextBoard = availableBoards[Math.floor(Math.random() * availableBoards.length)];
    }
    
    return { newBoards, newBigBoard, nextBoard };
  };

  // Simpler move ordering - focuses on winning/blocking, ignores send-to logic
  const orderMoves = (moves, gameBoards, gameBigBoard, player) => {
    const opponent = player === 'X' ? 'O' : 'X';
    
    return moves.map(move => {
      let priority = 0;
      const { newBoards, newBigBoard } = applyMoveToState(gameBoards, gameBigBoard, move, player);
      
      // Highest: Win the game
      if (checkWinner(newBigBoard) === player) {
        priority += 50000;
      }
      
      // Very high: Win a board
      if (newBigBoard[move.boardIdx] === player && gameBigBoard[move.boardIdx] === null) {
        priority += 3000 * (BOARD_IMPORTANCE[move.boardIdx] || 1);
      }
      
      // High: Block opponent from winning a board
      const testBlock = [...gameBoards[move.boardIdx]];
      testBlock[move.cellIdx] = opponent;
      if (checkWinner(testBlock) === opponent) {
        priority += 2500 * (BOARD_IMPORTANCE[move.boardIdx] || 1);
      }
      
      // Medium: Create threats
      const threatsBefore = countTwoInRows(gameBoards[move.boardIdx], player);
      const threatsAfter = countTwoInRows(newBoards[move.boardIdx], player);
      if (threatsAfter > threatsBefore) {
        priority += 500;
      }
      
      // Position bonuses
      if (move.cellIdx === 4) priority += 80;
      if ([0, 2, 6, 8].includes(move.cellIdx)) priority += 40;
      
      // Board importance
      priority += (BOARD_IMPORTANCE[move.boardIdx] || 1) * 50;
      
      // Small random factor to reduce predictability
      priority += Math.random() * 30;
      
      return { move, priority };
    }).sort((a, b) => b.priority - a.priority).map(item => item.move);
  };

  const minimax = (gameBoards, gameBigBoard, constraintBoard, depth, isMaximizing, alpha, beta) => {
    const metaWinner = checkWinner(gameBigBoard);
    if (metaWinner !== null || depth === 0) {
      return evaluateGameState(gameBoards, gameBigBoard, 'O');
    }

    const moves = getValidMoves(gameBoards, gameBigBoard, constraintBoard);
    if (moves.length === 0) return 0;

    // Only order top moves to save computation
    const orderedMoves = orderMoves(moves.slice(0, Math.min(moves.length, 12)), gameBoards, gameBigBoard, isMaximizing ? 'O' : 'X');

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (let move of orderedMoves) {
        const { newBoards, newBigBoard, nextBoard } = applyMoveToState(gameBoards, gameBigBoard, move, 'O');
        const evaluation = minimax(newBoards, newBigBoard, nextBoard, depth - 1, false, alpha, beta);
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (let move of orderedMoves) {
        const { newBoards, newBigBoard, nextBoard } = applyMoveToState(gameBoards, gameBigBoard, move, 'X');
        const evaluation = minimax(newBoards, newBigBoard, nextBoard, depth - 1, true, alpha, beta);
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  };

  const getBestAiMove = () => {
    try {
      const moves = getValidMoves(boards, bigBoard, activeBoard);
      if (moves.length === 0) return null;

      // Reduced depth = less perfect play
      const depth = 3;
      const orderedMoves = orderMoves(moves, boards, bigBoard, 'O');
      
      let bestMove = orderedMoves[0];
      let bestScore = -Infinity;
      const moveScores = [];

      for (let move of orderedMoves) {
        const { newBoards, newBigBoard, nextBoard } = applyMoveToState(boards, bigBoard, move, 'O');
        const score = minimax(newBoards, newBigBoard, nextBoard, depth - 1, false, -Infinity, Infinity);
        moveScores.push({ move, score });
        
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }

      // Higher mistake rate, but still somewhat intelligent mistakes
      if (Math.random() < aiMistakeRate && moveScores.length > 1) {
        moveScores.sort((a, b) => b.score - a.score);
        
        // Pick from top 3-4 moves randomly (not just second best)
        const topMoves = moveScores.slice(0, Math.min(4, moveScores.length));
        const randomIndex = Math.floor(Math.random() * topMoves.length);
        return topMoves[randomIndex].move;
      }

      return bestMove;
    } catch (error) {
      console.error('Error in getBestAiMove:', error);
      const moves = getValidMoves(boards, bigBoard, activeBoard);
      return moves[Math.floor(Math.random() * moves.length)] || null;
    }
  };

  const adjustDifficulty = (playerWon) => {
    if (playerWon) {
      // Player won - make AI harder (but slowly)
      setAiMistakeRate(prev => Math.max(0.05, prev - 0.02));
    } else {
      // AI won - make AI easier (faster adjustment)
      setAiMistakeRate(prev => Math.min(0.30, prev + 0.03));
    }
  };

  useEffect(() => {
    const userId = posthog?.get_distinct_id?.();
    posthog?.identify?.(userId);
    
    posthog?.onFeatureFlags?.(() => {
      const flagValue = posthog?.getFeatureFlag?.('ai-speed-affecting-total-session-duration');
      posthog?.capture?.('$feature_flag_called', {
        $feature_flag: 'ai-speed-affecting-total-session-duration',
        $feature_flag_response: flagValue
      });
    });
    
    posthog?.capture?.('session_started', {
      timestamp: new Date().toISOString()
    });

    const handleBeforeUnload = () => {
      const sessionDuration = Math.round((Date.now() - sessionStartTime) / 1000);
      posthog?.capture?.('session_ended', {
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

  useEffect(() => {
    const bigWinner = checkWinner(bigBoard);
    if (bigWinner && !gameOver) {
      setGameOver(true);
      setWinner(bigWinner);
      
      const gameDuration = gameStartTime ? Math.round((Date.now() - gameStartTime) / 1000) : 0;
      
      const newStats = { ...stats };
      if (bigWinner === 'X') {
        newStats.wins = stats.wins + 1;
        adjustDifficulty(true);
      } else if (bigWinner === 'O') {
        newStats.losses = stats.losses + 1;
        adjustDifficulty(false);
      } else {
        newStats.draws = stats.draws + 1;
      }
      setStats(newStats);

      let aiVariant = 'default';
      try {
        aiVariant = posthog?.getFeatureFlag?.('ai-speed-affecting-total-session-duration') || 'default';
      } catch (e) {}
      
      posthog?.capture?.('game_completed', {
        result: bigWinner === 'X' ? 'win' : bigWinner === 'O' ? 'loss' : 'draw',
        moves: moveCount,
        duration_seconds: gameDuration,
        moves_per_minute: gameDuration > 0 ? Math.round((moveCount / gameDuration) * 60) : 0,
        total_games_played: gamesPlayed + 1,
        win_streak: bigWinner === 'X' ? newStats.wins : 0,
        board_positions_used: bigBoard.filter(b => b !== null).length,
        $feature_flag: 'ai-speed-affecting-total-session-duration',
        $feature_flag_response: aiVariant,
        ai_thinking_variant: aiVariant,
        ai_mistake_rate: aiMistakeRate
      });

      setGamesPlayed(prev => prev + 1);
    }
  }, [bigBoard]);

  useEffect(() => {
    if (currentPlayer === 'O' && !gameOver) {
      setIsAiThinking(true);
      
      let aiThinkingTime = 600;
      try {
        const flagValue = posthog?.getFeatureFlag?.('ai-speed-affecting-total-session-duration');
        
        if (flagValue === 'control') {
          aiThinkingTime = 300;
        } else if (flagValue === 'slow') {
          aiThinkingTime = 900;
        }
      } catch (e) {
        console.log('Feature flag error:', e);
      }
      
      setTimeout(() => {
        const move = getBestAiMove();
        if (move) {
          handleMove(move.boardIdx, move.cellIdx);
        }
        setIsAiThinking(false);
      }, aiThinkingTime);
    }
  }, [currentPlayer, gameOver]);

  const handleMove = (boardIdx, cellIdx) => {
    try {
      if (gameOver || bigBoard[boardIdx] !== null || boards[boardIdx][cellIdx] !== null) return;
      
      if (activeBoard !== null && activeBoard !== boardIdx && bigBoard[activeBoard] === null) return;

      const newBoards = boards.map((board, i) => 
        i === boardIdx ? board.map((cell, j) => j === cellIdx ? currentPlayer : cell) : board
      );
      setBoards(newBoards);
      setLastMove({ boardIdx, cellIdx });
      setMoveCount(prev => prev + 1);

      posthog?.capture?.('move_made', {
        player: currentPlayer,
        board_index: boardIdx,
        cell_index: cellIdx,
        move_number: moveCount + 1,
        board_was_active: activeBoard === boardIdx || activeBoard === null
      });

      const smallWinner = checkWinner(newBoards[boardIdx]);
      let newBigBoard = bigBoard;
      if (smallWinner) {
        newBigBoard = [...bigBoard];
        newBigBoard[boardIdx] = smallWinner === 'draw' ? 'draw' : smallWinner;
        setBigBoard(newBigBoard);
        
        // Trigger win animation
        if (smallWinner !== 'draw') {
          setJustWonBoard(boardIdx);
        }

        posthog?.capture?.('board_completed', {
          board_index: boardIdx,
          winner: smallWinner,
          moves_to_complete: moveCount + 1
        });
      }

      // RANDOM NEXT BOARD - Fair for both players!
      // Pick a random available board instead of cell-based selection
      const availableBoards = newBigBoard
        .map((val, idx) => val === null ? idx : null)
        .filter(idx => idx !== null);
      
      let nextBoard = null;
      if (availableBoards.length > 0) {
        // 70% chance: random board, 30% chance: free choice (any board)
        if (Math.random() < 0.7) {
          nextBoard = availableBoards[Math.floor(Math.random() * availableBoards.length)];
        }
        // else nextBoard stays null = free choice
      }
      setActiveBoard(nextBoard);
      setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X');
    } catch (error) {
      console.error('Error in handleMove:', error);
      posthog?.capture?.('game_error', {
        error_type: 'handleMove',
        error_message: error.message,
        error_stack: error.stack,
        board_index: boardIdx,
        cell_index: cellIdx
      });
    }
  };

  const resetGame = () => {
    if (!gameOver && moveCount > 0) {
      const gameDuration = gameStartTime ? Math.round((Date.now() - gameStartTime) / 1000) : 0;
      posthog?.capture?.('game_abandoned', {
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
    setJustWonBoard(null);
    setGameStartTime(Date.now());

    posthog?.capture?.('game_started', {
      game_number: gamesPlayed + 1,
      current_win_streak: stats.wins,
      ai_mistake_rate: aiMistakeRate
    });
  };
  
  // Full reset including stats
  const resetAllStats = () => {
    resetGame();
    setStats({ wins: 0, losses: 0, draws: 0 });
    setGamesPlayed(0);
    setAiMistakeRate(0.15);
    try {
      localStorage.removeItem('ultimateTicTacToe');
    } catch (e) {
      console.log('Could not clear localStorage:', e);
    }
  };

  const handleRickRollClick = () => {
    setShowRickRoll(true);
    setShowPlayButton(true);
    setRickRollStartTime(Date.now());
    
    posthog?.capture?.('rickroll_clicked', {
      games_played: gamesPlayed,
      current_wins: stats.wins
    });
  };

  const handlePlayClick = () => {
    setShowPlayButton(false);
    const iframe = document.getElementById('rickroll-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
    }
  };

  const handleRickRollClose = () => {
    const watchDuration = rickRollStartTime ? Math.round((Date.now() - rickRollStartTime) / 1000) : 0;
    
    posthog?.capture?.('rickroll_closed', {
      watch_duration_seconds: watchDuration
    });
    
    setShowRickRoll(false);
  };

  const renderSmallBoard = (boardIdx) => {
    const isActive = activeBoard === null ? bigBoard[boardIdx] === null : activeBoard === boardIdx;
    const board = boards[boardIdx];
    const boardWinner = bigBoard[boardIdx];
    const isJustWon = justWonBoard === boardIdx;
    
    return (
      <div 
        key={boardIdx}
        className={`small-board ${isActive && !gameOver ? 'active' : ''} ${boardWinner ? 'won' : ''} ${isJustWon ? 'just-won' : ''}`}
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
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (currentPlayer === 'X') {
                    handleMove(boardIdx, cellIdx);
                  }
                }}
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
        {showPlayButton && (
          <div className="play-overlay" onClick={handlePlayClick}>
            <button className="play-button">
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                <circle cx="40" cy="40" r="38" stroke="white" strokeWidth="3" fill="rgba(0,0,0,0.7)" />
                <path d="M 30 20 L 30 60 L 60 40 Z" fill="white" />
              </svg>
              <span className="play-text">Play Video</span>
            </button>
          </div>
        )}
        <iframe
          id="rickroll-iframe"
          width="100%"
          height="100%"
          src="https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1&autoplay=0&mute=0"
          title="You shouldn't have clicked that..."
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="game-container">
        <div className="header">
          <h1>Oops! Something went wrong</h1>
          <p className="subtitle">The game encountered an error</p>
        </div>
        <div className="controls">
          <button 
            onClick={() => {
              setHasError(false);
              resetGame();
            }} 
            className="btn btn-secondary"
          >
            Try Again
          </button>
        </div>
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
        <h1>Ultimate Tic-Tac-Toe</h1>
        <p className="subtitle">
          {gameOver ? 'Game Over!' : activeBoard !== null ? 'Play in highlighted board' : 'Play any board'}
        </p>
        <p className="rules">Win 3 small boards in a row</p>
      </div>

      <div className="stats">
        <span>W: {stats.wins}</span>
        <span className="stat-divider">|</span>
        <span>L: {stats.losses}</span>
        <span className="stat-divider">|</span>
        <span>D: {stats.draws}</span>
      </div>

      <div className="board-wrapper">
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