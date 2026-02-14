import { useState, useEffect, useRef } from "react";
import { ref, onValue, update } from "firebase/database";
import { db, auth } from "../firebase";

// 🎵 Simple sound generator
const useSound = () => {
  const ctxRef = useRef(null);

  if (!ctxRef.current) {
    ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
  }

  const play = (type = "toss") => {
    const ctx = ctxRef.current;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);

    // Frequency and type for each sound
    switch (type) {
      case "toss":
        o.frequency.value = 600;
        o.type = "sine";
        g.gain.value = 0.2;
        break;
      case "pick":
        o.frequency.value = 800;
        o.type = "triangle";
        g.gain.value = 0.2;
        break;
      case "catch":
        o.frequency.value = 1000;
        o.type = "square";
        g.gain.value = 0.25;
        break;
      case "fail":
        o.frequency.value = 300;
        o.type = "sawtooth";
        g.gain.value = 0.3;
        break;
      case "bg":
        o.frequency.value = 200;
        o.type = "sine";
        g.gain.value = 0.05;
        break;
      default:
        o.frequency.value = 500;
        g.gain.value = 0.2;
    }

    o.start();
    o.stop(ctx.currentTime + 0.15); // short sound
  };

  return { play };
};

export default function GameRoom({ playerName, roomId }) {
  const playerId = auth.currentUser.uid;

  const [gameState, setGameState] = useState(null);
  const [airStone, setAirStone] = useState(null);
  const [pickedGroup, setPickedGroup] = useState([]);
  const [remainingStones, setRemainingStones] = useState([0, 1, 2, 3, 4]);
  const [collectedStones, setCollectedStones] = useState([]);
  const [stonePositions, setStonePositions] = useState([]);
  const [fail, setFail] = useState(false);
  const [isFalling, setIsFalling] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  const timerRef = useRef(null);

  const { play } = useSound();

  // 🔥 Generate random stone positions
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

  const stonesOnTable = remainingStones.length;
  let required;
  if (stonesOnTable === 1) {
    required = 0;
  } else if (stonesOnTable < level + 1) {
    required = -1;
  } else {
    required = level;
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
    if (!isMyTurn || airStone !== null || required < 0) return;

    // Background "music" on first toss
    if (soundOn) play("bg");

    setAirStone(id);
    setFail(false);
    setPickedGroup([]);
    setIsFalling(false);

    if (soundOn) play("toss");
    if (navigator.vibrate) navigator.vibrate(50);

    setTimeout(() => setIsFalling(true), 750);
    timerRef.current = setTimeout(handleFail, 1500);
  };

  // 🎯 PICK
  const pickStone = (id) => {
    if (!isMyTurn || airStone === null || id === airStone || pickedGroup.includes(id) || pickedGroup.length >= required) return;

    setPickedGroup((prev) => [...prev, id]);
    if (soundOn) play("pick");
  };

  // 🎯 CATCH
  const catchStone = () => {
    if (!isMyTurn || airStone === null || pickedGroup.length !== required) return;

    clearTimeout(timerRef.current);
    setIsFalling(false);

    if (soundOn) play("catch");
    if (navigator.vibrate) navigator.vibrate(80);

    const newCollected = [...collectedStones, airStone];
    const tempRemaining = remainingStones.filter(
      (stone) => !pickedGroup.includes(stone) && stone !== airStone
    );

    setCollectedStones(newCollected);
    setAirStone(null);

    if (newCollected.length === 5 || tempRemaining.length === 0) {
      const nextLevel = level >= 5 ? 1 : level + 1;

      update(ref(db, `rooms/${roomId}/players/${playerId}`), {
        level: nextLevel,
      });

      update(ref(db, `rooms/${roomId}/gameState/scores`), {
        [playerId]: (scores[playerId] || 0) + 1,
      });

      setPickedGroup([]);
      setRemainingStones([0, 1, 2, 3, 4]);
      setCollectedStones([]);
      generatePositions();
    } else {
      setRemainingStones(tempRemaining);
      setTimeout(() => {
        setRemainingStones((prev) => [...prev, ...pickedGroup]);
        setPickedGroup([]);
      }, 500);
    }
  };

  // ❌ FAIL
  const handleFail = () => {
    setFail(true);
    setIsFalling(true);

    if (soundOn) play("fail");
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    setTimeout(() => {
      setAirStone(null);
      setPickedGroup([]);
      setIsFalling(false);
      setFail(false);

      if (collectedStones.length > 0) {
        setRemainingStones([0, 1, 2, 3, 4]);
        setCollectedStones([]);
        generatePositions();
      }
      switchTurn();
    }, 800);
  };

  return (
    <div
      style={{
        background: fail ? "#7B241C" : "#F3E5AB",
        color: "#4B3621",
        minHeight: "100vh",
        padding: "30px",
        textAlign: "center",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        transition: "0.2s",
      }}
    >
      <h2 style={{ fontFamily: "'Courier New', Courier, monospace" }}>🪨 Batu Seremban</h2>
      <h3>
        Level {level} — Pick {required >= 0 ? required : "N/A"}
      </h3>
      <h4>{isMyTurn ? "🟢 Your Turn" : "🔴 Waiting"}</h4>
      <p style={{ fontSize: "14px", color: "#6B4C3B" }}>
        Stones on table: {remainingStones.length} | In hand: {collectedStones.length}
      </p>

      {/* 🔊 Sound toggle */}
      <button
        onClick={() => setSoundOn((prev) => !prev)}
        style={{
          padding: "6px 12px",
          marginBottom: "20px",
          cursor: "pointer",
          borderRadius: "8px",
          border: "none",
          background: "#D2691E",
          color: "#fff",
        }}
      >
        {soundOn ? "🔊 Sound On" : "🔇 Sound Off"}
      </button>

      {fail && <h2 style={{ color: "red" }}>FAILED!</h2>}

      {/* Table */}
      <div
        style={{
          margin: "40px auto",
          width: "500px",
          height: "200px",
          background: "#8B4513",
          borderRadius: "20px",
          position: "relative",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
          border: "5px solid #A0522D",
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
                    ? "#FFA500"
                    : pickedGroup.includes(id)
                    ? "#FFD700"
                    : "#CD853F",
                cursor: isMyTurn && required >= 0 ? "pointer" : "default",
                transition: "bottom 0.75s ease, background 0.3s ease",
                boxShadow: "2px 2px 5px rgba(0,0,0,0.5)",
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

      {/* Scores */}
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
