import { useState, useEffect } from "react";
import { ref, set, update, get, onValue } from "firebase/database";
import { db, auth } from "../firebase";

export default function Lobby({ playerName, setRoomId }) {
  const [joinCode, setJoinCode] = useState("");
  const [playersInRoom, setPlayersInRoom] = useState({});
  const playerId = auth.currentUser.uid;

  // CREATE ROOM
  const createRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();

    // Initialize room
    set(ref(db, `rooms/${newRoomId}`), {
      players: { [playerId]: { name: playerName, collected: [] } },
      gameState: {
        turn: playerId,
        scores: { [playerId]: 0 },
        round: 1,
        chaos: false
      }
    });

    setJoinCode(newRoomId); // Subscribe to room
  };

  // JOIN ROOM
  const joinRoom = async () => {
    if (!joinCode) return alert("Enter room code");

    const roomRef = ref(db, `rooms/${joinCode}/players`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      alert("Room does not exist!");
      return;
    }

    // Add player to players
    update(roomRef, { [playerId]: { name: playerName, collected: [] } });

    // Add player to gameState.scores
    const scoreRef = ref(db, `rooms/${joinCode}/gameState/scores`);
    update(scoreRef, { [playerId]: 0 });

    setJoinCode(joinCode); // Subscribe to room
  };

  // Listen to players and auto-start when 2+
  useEffect(() => {
    if (!joinCode) return;

    const playersRef = ref(db, `rooms/${joinCode}/players`);
    const unsubscribe = onValue(playersRef, (snapshot) => {
      if (snapshot.exists()) {
        const players = snapshot.val();
        setPlayersInRoom(players);

        // Auto-start game if 2+ players
        if (Object.keys(players).length >= 2) {
          setRoomId(joinCode);
        }
      }
    });

    return () => unsubscribe();
  }, [joinCode, setRoomId]);

  return (
    <div style={{ padding: "40px", fontSize: "24px" }}>
      <h2>Spirit Stone Lobby</h2>
      <button onClick={createRoom}>Create Room</button>
      <hr />
      <input
        placeholder="Enter Room Code"
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
      />
      <button onClick={joinRoom}>Join Room</button>

      {Object.keys(playersInRoom).length > 0 && (
        <>
          <h3>Players in this room:</h3>
          <ul>
            {Object.entries(playersInRoom).map(([id, p]) => (
              <li key={id}>{p.name} {id === playerId ? "(You)" : ""}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
