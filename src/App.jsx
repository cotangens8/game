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
        console.log('PostHog instance:', ph);
        // Test feature flag immediately
        setTimeout(() => {
          const flagValue = ph.getFeatureFlagPayload('ai-thinking-time');
          console.log('Feature flag value:', flagValue);
        }, 1000);
      },
      disable_session_recording: true,
      disable_surveys: true,
    });
    console.log('PostHog init called');
  } catch (error) {
    console.error('PostHog initialization error:', error);
  }
}

// AI Evaluation Weights
const WEIGHTS = {
  meta_win: 10000,
  meta_two_in_row: 500,
  meta_center: 200,
  meta_corner: 100,
  local_win: 150,
  local_two_in_row: 20,
  local_center: 8,
  local_corner: 5,
  send_to_won_board: 80,
  send_to_losing_board: -60,
  block_opponent_meta: 400
};

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
  const [aiMistakeRate, setAiMistakeRate] = useState(0.10);
  const [hasError, setHasError] = useState(false);

  // Error boundary effect
  useEffect(() => {
    const errorHandler = (error, errorInfo) => {
      setHasError(true);
      posthog?.capture?.('react_error', {
        error_message: error.toString(),
        error_stack: error.stack,
        component_stack: errorInfo?.componentStack,
        page_url: window.location.href
      });
    };

    window.addEventListener('reactError', (event) => {
      errorHandler(event.detail.error, event.detail.errorInfo);
    });

    return () => {
      window.removeEventListener('reactError', errorHandler);
    };
  }, []);

  const winCombos = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  // Check if a board has a winner
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

  // Count two-in-a-rows with empty third cell
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

  // Evaluate local board position
  const evaluateLocalBoard = (board, player) => {
    const opponent = player === 'X' ? 'O' : 'X';
    let score = 0;

    // Check if won
    const winner = checkWinner(board);
    if (winner === player) return WEIGHTS.local_win;
    if (winner === opponent) return -WEIGHTS.local_win;
    if (winner === 'draw') return 0;

    // Two in a rows
    score += countTwoInRows(board, player) * WEIGHTS.local_two_in_row;
    score -= countTwoInRows(board, opponent) * WEIGHTS.local_two_in_row;

    // Center control
    if (board[4] === player) score += WEIGHTS.local_center;
    if (board[4] === opponent) score -= WEIGHTS.local_center;

    // Corner control
    for (let corner of [0, 2, 6, 8]) {
      if (board[corner] === player) score += WEIGHTS.local_corner;
      if (board[corner] === opponent) score -= WEIGHTS.local_corner;
    }

    return score;
  };

  // Evaluate entire game state
  const evaluateGameState = (gameBoards, gameBigBoard, nextBoard, player) => {
    const opponent = player === 'X' ? 'O' : 'X';
    let score = 0;

    // Check for meta win
    const metaWinner = checkWinner(gameBigBoard);
    if (metaWinner === player) return WEIGHTS.meta_win;
    if (metaWinner === opponent) return -WEIGHTS.meta_win;

    // Meta-board analysis
    score += countTwoInRows(gameBigBoard, player) * WEIGHTS.meta_two_in_row;
    score -= countTwoInRows(gameBigBoard, opponent) * WEIGHTS.meta_two_in_row;

    // Meta center and corners
    if (gameBigBoard[4] === player) score += WEIGHTS.meta_center;
    if (gameBigBoard[4] === opponent) score -= WEIGHTS.meta_center;

    for (let corner of [0, 2, 6, 8]) {
      if (gameBigBoard[corner] === player) score += WEIGHTS.meta_corner;
      if (gameBigBoard[corner] === opponent) score -= WEIGHTS.meta_corner;
    }

    // Local boards analysis
    for (let i = 0; i < 9; i++) {
      if (gameBigBoard[i] === null) {
        score += evaluateLocalBoard(gameBoards[i], player);
      }
    }

    // Board-sending penalty
    if (nextBoard !== null && gameBigBoard[nextBoard] !== null) {
      score -= WEIGHTS.send_to_won_board;
    }

    return score;
  };

  // Get valid moves
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

  // Apply move and return new state
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

    const nextBoard = newBigBoard[move.cellIdx] === null ? move.cellIdx : null;
    
    return { newBoards, newBigBoard, nextBoard };
  };

  // Order moves for better pruning
  const orderMoves = (moves, gameBoards, gameBigBoard, player) => {
    return moves.map(move => {
      let priority = 0;
      const { newBoards, newBigBoard } = applyMoveToState(gameBoards, gameBigBoard, move, player);
      
      // Wins local board
      if (newBigBoard[move.boardIdx] === player && gameBigBoard[move.boardIdx] === null) {
        priority += 1000;
      }
      
      // Blocks opponent win
      const opponent = player === 'X' ? 'O' : 'X';
      const testBoard = [...gameBoards[move.boardIdx]];
      testBoard[move.cellIdx] = opponent;
      if (checkWinner(testBoard) === opponent) {
        priority += 800;
      }
      
      // Sends to completed board
      if (gameBigBoard[move.cellIdx] !== null) {
        priority += 200;
      }
      
      // Center/corner preference
      if (move.cellIdx === 4) priority += 50;
      if ([0, 2, 6, 8].includes(move.cellIdx)) priority += 30;
      
      return { move, priority };
    }).sort((a, b) => b.priority - a.priority).map(item => item.move);
  };

  // Minimax with alpha-beta pruning
  const minimax = (gameBoards, gameBigBoard, constraintBoard, depth, isMaximizing, alpha, beta, player) => {
    const opponent = player === 'X' ? 'O' : 'X';
    
    // Terminal conditions
    const metaWinner = checkWinner(gameBigBoard);
    if (metaWinner !== null || depth === 0) {
      return evaluateGameState(gameBoards, gameBigBoard, constraintBoard, 'O');
    }

    const moves = getValidMoves(gameBoards, gameBigBoard, constraintBoard);
    if (moves.length === 0) return 0;

    const orderedMoves = orderMoves(moves, gameBoards, gameBigBoard, isMaximizing ? 'O' : 'X');

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (let move of orderedMoves) {
        const { newBoards, newBigBoard, nextBoard } = applyMoveToState(
          gameBoards, gameBigBoard, move, 'O'
        );
        const evaluation = minimax(newBoards, newBigBoard, nextBoard, depth - 1, false, alpha, beta, player);
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (let move of orderedMoves) {
        const { newBoards, newBigBoard, nextBoard } = applyMoveToState(
          gameBoards, gameBigBoard, move, 'X'
        );
        const evaluation = minimax(newBoards, newBigBoard, nextBoard, depth - 1, true, alpha, beta, player);
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  };

  // Get best AI move
  const getBestAiMove = () => {
    try {
      const moves = getValidMoves(boards, bigBoard, activeBoard);
      if (moves.length === 0) return null;

      const depth = 4; // Medium difficulty
      const orderedMoves = orderMoves(moves, boards, bigBoard, 'O');
      
      let bestMove = orderedMoves[0];
      let bestScore = -Infinity;
      const moveScores = [];

      for (let move of orderedMoves) {
        const { newBoards, newBigBoard, nextBoard } = applyMoveToState(boards, bigBoard, move, 'O');
        const score = minimax(newBoards, newBigBoard, nextBoard, depth - 1, false, -Infinity, Infinity, 'O');
        moveScores.push({ move, score });
        
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }

      // Adaptive difficulty - sometimes pick suboptimal move
      if (Math.random() < aiMistakeRate && moveScores.length > 1) {
        moveScores.sort((a, b) => b.score - a.score);
        const suboptimalIndex = Math.min(1 + Math.floor(Math.random() * 2), moveScores.length - 1);
        return moveScores[suboptimalIndex].move;
      }

      return bestMove;
    } catch (error) {
      console.error('Error in getBestAiMove:', error);
      posthog?.capture?.('ai_error', {
        error_message: error.message,
        error_stack: error.stack,
        game_state: {
          activeBoard,
          moveCount,
          aiMistakeRate
        }
      });
      // Fallback to random valid move
      const moves = getValidMoves(boards, bigBoard, activeBoard);
      return moves[Math.floor(Math.random() * moves.length)] || null;
    }
  };

  // Adjust AI difficulty based on results
  const adjustDifficulty = (playerWon) => {
    if (playerWon) {
      setAiMistakeRate(prev => Math.max(0.02, prev - 0.03));
    } else {
      setAiMistakeRate(prev => Math.min(0.25, prev + 0.02));
    }
  };

  // Track session on mount and explicitly fetch feature flags
  useEffect(() => {
    const userId = posthog?.get_distinct_id?.();
    posthog?.identify?.(userId);
    
    // Explicitly call feature flags to trigger tracking
    posthog?.onFeatureFlags?.(() => {
      const flagValue = posthog?.getFeatureFlag?.('ai-speed-affecting-total-session-duration');
      console.log('Feature flag loaded:', flagValue);
      
      // Track that we checked the flag
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
        // Use getFeatureFlag instead of getFeatureFlagPayload for better tracking
        const flagValue = posthog?.getFeatureFlag?.('ai-speed-affecting-total-session-duration');
        console.log('AI thinking flag value:', flagValue);
        
        if (flagValue === 'control') {
          aiThinkingTime = 300; // Fast - control group
        } else if (flagValue === 'slow') {
          aiThinkingTime = 900; // Slow - test variant
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
      if (smallWinner) {
        const newBigBoard = [...bigBoard];
        newBigBoard[boardIdx] = smallWinner === 'draw' ? 'draw' : smallWinner;
        setBigBoard(newBigBoard);

        posthog?.capture?.('board_completed', {
          board_index: boardIdx,
          winner: smallWinner,
          moves_to_complete: moveCount + 1
        });
      }

      const nextBoard = bigBoard[cellIdx] === null ? cellIdx : null;
      setActiveBoard(nextBoard);
      setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X');
    } catch (error) {
      console.error('Error in handleMove:', error);
      posthog?.capture?.('game_error', {
        error_type: 'handleMove',
        error_message: error.message,
        error_stack: error.stack,
        board_index: boardIdx,
        cell_index: cellIdx,
        game_state: {
          currentPlayer,
          moveCount,
          activeBoard
        }
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
    setGameStartTime(Date.now());

    posthog?.capture?.('game_started', {
      game_number: gamesPlayed + 1,
      current_win_streak: stats.wins,
      ai_mistake_rate: aiMistakeRate
    });
  };

  const handleRickRollClick = () => {
    setShowRickRoll(true);
    setRickRollStartTime(Date.now());
    
    posthog?.capture?.('rickroll_clicked', {
      games_played: gamesPlayed,
      current_wins: stats.wins
    });
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

  if (hasError) {
    return (
      <div className="game-container">
        <div className="header">
          <h1>Oops! Something went wrong</h1>
          <p className="subtitle">The game encountered an error. We've been notified!</p>
        </div>
        <div className="controls">
          <button 
            onClick={() => {
              setHasError(false);
              resetGame();
            }} 
            className="btn btn-secondary"
          >
            <span className="btn-icon">↻</span>
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