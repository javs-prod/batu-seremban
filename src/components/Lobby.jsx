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
    set(ref(db, `rooms/${newRoomId}`), {
      players: { [playerId]: { name: playerName } },
      gameState: {
        turn: playerId,
        scores: { [playerId]: 0 },
        round: 1,
        chaos: false
      }
    });

    setJoinCode(newRoomId); // Subscribe to this room
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

    update(roomRef, { [playerId]: { name: playerName } });
    update(ref(db, `rooms/${joinCode}/gameState/scores`), { [playerId]: 0 });

    setJoinCode(joinCode); // Subscribe to this room
  };

  // LISTEN FOR PLAYERS AND AUTO-START GAME WHEN >= 2
  useEffect(() => {
    if (!joinCode) return;

    const playersRef = ref(db, `rooms/${joinCode}/players`);
    const unsubscribe = onValue(playersRef, (snapshot) => {
      if (snapshot.exists()) {
        const players = snapshot.val();
        setPlayersInRoom(players);

        if (Object.keys(players).length >= 2) {
          setRoomId(joinCode); // AUTO-START game
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
