import { useState, useEffect, useRef } from "react";
import { ref, onValue, update } from "firebase/database";
import { db, auth } from "../firebase";

export default function GameRoom({ playerName, roomId }) {
  const playerId = auth.currentUser.uid;

  const [gameState, setGameState] = useState(null);
  const [airStone, setAirStone] = useState(null);
  const [pickedGroup, setPickedGroup] = useState([]);
  const [remainingStones, setRemainingStones] = useState([0, 1, 2, 3, 4]);
  const [collectedStones, setCollectedStones] = useState([]); // Stones collected in hand
  const [stonePositions, setStonePositions] = useState([]);
  const [fail, setFail] = useState(false);
  const [isFalling, setIsFalling] = useState(false);

  const timerRef = useRef(null);

  // 🔥 Generate random stone positions WITHOUT overlap
  const generatePositions = () => {
    const positions = [];
    const tableWidth = 500;
    const stoneWidth = 40;
    const minGap = 50;

    for (let i = 0; i < 5; i++) {
      let left;
      let tries = 0;

      do {
        left = Math.floor(Math.random() * (tableWidth - stoneWidth - 20)) + 10;
        tries++;
      } while (
        positions.some((s) => Math.abs(s.left - left) < minGap) &&
        tries < 100
      );

      positions.push({
        id: i,
        left,
        baseBottom: 30 + Math.floor(Math.random() * 20),
      });
    }

    setStonePositions(positions);
  };

  // generate once at start
  useEffect(() => {
    generatePositions();
  }, []);

  // 🔥 Sync room
  useEffect(() => {
    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        setGameState(snapshot.val());
      }
    });
    return () => unsubscribe();
  }, [roomId]);

  if (!gameState) return <div>Loading...</div>;

  const players = gameState.players || {};
  const scores = gameState.gameState?.scores || {};
  const playerIds = Object.keys(scores);

  if (playerIds.length < 2) {
    return (
      <div style={{ padding: "40px", fontSize: "24px" }}>
        Waiting for other players to join...
      </div>
    );
  }

  const playerData = players[playerId] || {};
  const level = playerData.level || 1;

  // ✅ Determine required picks based on level
  // Need at least (level + 1) stones: 1 to toss + level to pick
  // EXCEPT when there's only 1 stone left - just toss and catch it
  let required;
  const stonesOnTable = remainingStones.length;
  
  if (stonesOnTable === 1) {
    required = 0; // Last stone - just toss and catch
  } else if (stonesOnTable < level + 1) {
    required = -1; // Cannot play - not enough stones
  } else {
    required = level; // Pick exactly 'level' number of stones
  }

  const isMyTurn = gameState.gameState.turn === playerId;

  const switchTurn = () => {
    const idx = playerIds.indexOf(playerId);
    const nextPlayer = playerIds[(idx + 1) % playerIds.length];
    update(ref(db, `rooms/${roomId}/gameState`), {
      turn: nextPlayer,
    });
  };

  // 🎯 THROW
  const throwStone = (id) => {
    if (!isMyTurn) return;
    if (airStone !== null) return;
    if (required < 0) return; // Cannot play if not enough stones

    setAirStone(id);
    setFail(false);
    setPickedGroup([]);
    setIsFalling(false);

    setTimeout(() => setIsFalling(true), 750);

    timerRef.current = setTimeout(handleFail, 1500);
  };

  // 🎯 PICK
  const pickStone = (id) => {
    if (!isMyTurn) return;
    if (airStone === null) return;
    if (id === airStone) return;
    if (!remainingStones.includes(id)) return;
    if (pickedGroup.includes(id)) return;
    if (pickedGroup.length >= required) return;

    setPickedGroup((prev) => [...prev, id]);
  };

  // 🎯 CATCH
  const catchStone = () => {
    if (!isMyTurn) return;
    if (airStone === null) return;
    // Allow catching with required picks (including 0 for last stone)
    if (pickedGroup.length !== required) return;

    clearTimeout(timerRef.current);
    setIsFalling(false);

    // ✅ Add ONLY the tossed stone to collected pile permanently
    const newCollected = [...collectedStones, airStone];
    
    // ✅ Temporarily remove picked stones from table (they're in your hand)
    const tempRemaining = remainingStones.filter(
      (stone) => !pickedGroup.includes(stone) && stone !== airStone
    );

    setCollectedStones(newCollected);
    setAirStone(null);

    // ✅ Check if level is complete
    // Level complete when all 5 stones are collected OR no stones left on table
    if (newCollected.length === 5 || tempRemaining.length === 0) {
      const nextLevel = level >= 5 ? 1 : level + 1;

      update(ref(db, `rooms/${roomId}/players/${playerId}`), {
        level: nextLevel,
      });

      update(ref(db, `rooms/${roomId}/gameState/scores`), {
        [playerId]: (scores[playerId] || 0) + 1,
      });

      // Reset for next level
      setPickedGroup([]);
      setRemainingStones([0, 1, 2, 3, 4]);
      setCollectedStones([]);
      generatePositions();
    } else {
      // ✅ Put picked stones back on table for next round
      setRemainingStones(tempRemaining);
      
      setTimeout(() => {
        setRemainingStones((prev) => [...prev, ...pickedGroup]);
        setPickedGroup([]);
      }, 500);
    }
    // ✅ Player keeps turn until fail
  };

  // ❌ FAIL
  const handleFail = () => {
    setFail(true);
    setIsFalling(true);

    setTimeout(() => {
      setAirStone(null);
      setPickedGroup([]);
      setIsFalling(false);
      setFail(false);

      // Put any collected stones back
      if (collectedStones.length > 0) {
        setRemainingStones([0, 1, 2, 3, 4]);
        setCollectedStones([]);
        generatePositions();
      }

      // Switch turn on fail
      switchTurn();
    }, 800);
  };

  return (
    <div
      style={{
        background: fail ? "#400" : "#111",
        color: "white",
        minHeight: "100vh",
        padding: "30px",
        textAlign: "center",
        transition: "0.2s",
      }}
    >
      <h2>🪨 Spirit Stone (Batu Seremban)</h2>
      <h3>
        Level {level} — Pick {required >= 0 ? required : "N/A"}
      </h3>
      <h4>{isMyTurn ? "🟢 Your Turn" : "🔴 Waiting"}</h4>
      <p style={{ fontSize: "14px", color: "#aaa" }}>
        Stones on table: {remainingStones.length} | In hand: {collectedStones.length}
      </p>

      {fail && <h2 style={{ color: "red" }}>FAILED!</h2>}

      <div
        style={{
          margin: "40px auto",
          width: "500px",
          height: "200px",
          background: "#5c3b1e",
          borderRadius: "20px",
          position: "relative",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
        }}
      >
        {remainingStones.map((id) => {
          const pos = stonePositions.find((s) => s.id === id);
          if (!pos) return null;

          return (
            <div
              key={id}
              onClick={() =>
                required >= 0 && isMyTurn
                  ? airStone === null
                    ? throwStone(id)
                    : pickStone(id)
                  : null
              }
              style={{
                position: "absolute",
                bottom:
                  airStone === id
                    ? isFalling
                      ? `${pos.baseBottom}px`
                      : "130px"
                    : `${pos.baseBottom}px`,
                left: `${pos.left}px`,
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background:
                  airStone === id
                    ? "orange"
                    : pickedGroup.includes(id)
                    ? "gold"
                    : "#c08457",
                cursor: isMyTurn && required >= 0 ? "pointer" : "default",
                transition: "bottom 0.75s ease",
              }}
            />
          );
        })}

        {airStone !== null && (
          <div
            onClick={catchStone}
            style={{
              position: "absolute",
              bottom: "170px",
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: "50px",
              cursor: "pointer",
            }}
          >
            ✋
          </div>
        )}
      </div>

      <h3>🏆 Scores</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {Object.entries(scores).map(([id, score]) => (
          <li key={id}>
            {id === playerId ? playerName : players[id]?.name || id} : {score}
          </li>
        ))}
      </ul>
    </div>
  );
}
