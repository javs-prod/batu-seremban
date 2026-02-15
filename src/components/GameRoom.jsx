import { useState, useEffect, useRef } from "react";
import { ref, onValue, update } from "firebase/database";
import { db, auth } from "../firebase";

// 🎵 Simple sound generator
const useSound = () => {
  const ctxRef = useRef(null);
  
  const initAudio = () => {
    if (!ctxRef.current) {
      try {
        ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn("Audio context not available:", e);
      }
    }
  };

  const play = (type = "toss") => {
    try {
      initAudio();
      if (!ctxRef.current) return;
      
      // Resume audio context if suspended (browser autoplay policy)
      if (ctxRef.current.state === 'suspended') {
        ctxRef.current.resume();
      }
      
      const ctx = ctxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);

      switch (type) {
        case "toss": o.frequency.value = 600; o.type = "sine"; g.gain.value = 0.2; break;
        case "pick": o.frequency.value = 800; o.type = "triangle"; g.gain.value = 0.2; break;
        case "catch": o.frequency.value = 1000; o.type = "square"; g.gain.value = 0.25; break;
        case "fail": o.frequency.value = 300; o.type = "sawtooth"; g.gain.value = 0.3; break;
        case "bg": o.frequency.value = 200; o.type = "sine"; g.gain.value = 0.05; break;
        case "interrupt": o.frequency.value = 400; o.type = "sawtooth"; g.gain.value = 0.2; break;
        case "earthquake": o.frequency.value = 150; o.type = "sawtooth"; g.gain.value = 0.4; break;
        case "teleport": o.frequency.value = 1200; o.type = "sine"; g.gain.value = 0.3; break;
        default: o.frequency.value = 500; g.gain.value = 0.2;
      }

      o.start();
      o.stop(ctx.currentTime + 0.15);
    } catch (e) {
      // Silently fail - don't block the interrupt
      console.warn("Sound play failed:", e);
    }
  };

  return { play };
};

// 🔹 All stones are the same
const stoneStyle = { emoji: "🪨", color: "#8B4513" };

export default function GameRoom({ playerName, roomId }) {
  const playerId = auth.currentUser.uid;

  const [gameState, setGameState] = useState(null);
  const [airStone, setAirStone] = useState(null);
  const [pickedGroup, setPickedGroup] = useState([]);
  const [remainingStones, setRemainingStones] = useState([0,1,2,3,4]);
  const [collectedStones, setCollectedStones] = useState([]);
  const [stonePositions, setStonePositions] = useState([]);
  const [fail, setFail] = useState(false);
  const [isFalling, setIsFalling] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [interruptEffect, setInterruptEffect] = useState(null);
  const [teleportingStone, setTeleportingStone] = useState(null);
  const [earthquakeCooldown, setEarthquakeCooldown] = useState(false);
  const [teleportCooldown, setTeleportCooldown] = useState(false);

  const timerRef = useRef(null);
  const lastSyncedStateRef = useRef(null);
  const lastInterruptTimestampRef = useRef(0);
  const { play } = useSound();

  // 🔹 Generate random stone positions (responsive)
  const generatePositions = () => {
    const positions = [];
    // Use percentage-based positioning instead of fixed pixels
    const stoneSize = 8; // percentage of table width
    const minGap = 12; // minimum gap as percentage

    for(let i=0;i<5;i++){
      let left, bottom, tries=0;
      do {
        // Generate positions as percentages (5% to 85% to keep stones inside)
        left = 5 + Math.floor(Math.random() * (85 - stoneSize));
        // Bottom position: 10% to 50% of table height
        bottom = 10 + Math.floor(Math.random() * 40);
        tries++;
      } while(
        positions.some(s=>Math.abs(s.left-left)<minGap && Math.abs(s.baseBottom-bottom)<minGap) && 
        tries<100
      );

      positions.push({id:i, left, baseBottom:bottom});
    }
    setStonePositions(positions);
  };

  useEffect(()=>generatePositions(), []);

  // 🔹 Interrupt opponent
  const sendInterrupt = (type) => {
    // Check cooldown
    if (type === "earthquake" && earthquakeCooldown) return;
    if (type === "teleport" && teleportCooldown) return;
    
    try {
      console.log("Sending interrupt:", type, "by:", playerId);
      const interruptRef = ref(db, `rooms/${roomId}/gameState/interrupt`);
      update(interruptRef, { type, by: playerId, timestamp: Date.now() });
      
      // Set cooldown
      if (type === "earthquake") {
        setEarthquakeCooldown(true);
        setTimeout(() => setEarthquakeCooldown(false), 2000);
      } else if (type === "teleport") {
        setTeleportCooldown(true);
        setTimeout(() => setTeleportCooldown(false), 2000);
      }
      
      // Play sound only if enabled
      if (soundOn) {
        if (type === "earthquake") {
          play("earthquake");
        } else if (type === "teleport") {
          play("teleport");
        } else {
          play("interrupt");
        }
      }
    } catch (error) {
      console.error("Failed to send interrupt:", error);
    }
  };

  // 🔹 Sync room + listen for interrupts
  useEffect(() => {
    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.val();
      setGameState(data);

      // Interrupt: show effect only if it's from opponent AND it's MY turn (I'm being interrupted)
      const interrupt = data.gameState?.interrupt;
      const isMyTurnNow = data.gameState?.turn === playerId;
      
      console.log("Interrupt check:", { 
        interrupt, 
        isMyTurnNow, 
        myId: playerId,
        interruptBy: interrupt?.by,
        timestamp: interrupt?.timestamp,
        lastProcessed: lastInterruptTimestampRef.current,
        now: Date.now(),
        timeDiff: interrupt ? Date.now() - interrupt.timestamp : null
      });
      
      // Only process if:
      // 1. Interrupt exists
      // 2. It's from opponent (not me)
      // 3. It's recent (within 2 seconds)
      // 4. It's my turn (I'm being interrupted)
      // 5. We haven't already processed this exact interrupt
      if (
        interrupt && 
        interrupt.by !== playerId && 
        interrupt.timestamp > Date.now() - 2000 && 
        isMyTurnNow &&
        interrupt.timestamp !== lastInterruptTimestampRef.current
      ) {
        console.log("✅ Applying interrupt:", interrupt.type);
        
        // Mark this interrupt as processed
        lastInterruptTimestampRef.current = interrupt.timestamp;
        
        setInterruptEffect(interrupt.type);
        
        // Play appropriate sound
        if (soundOn) {
          if (interrupt.type === "earthquake") {
            play("earthquake");
          } else if (interrupt.type === "teleport") {
            play("teleport");
          } else {
            play("interrupt");
          }
        }
        
        // Handle earthquake: scatter stones (only if it's my turn)
        if (interrupt.type === "earthquake") {
          generatePositions(); // Regenerate random positions
          if(navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
        }
        
        // Handle teleport: randomly pick one stone and move it with animation
        if (interrupt.type === "teleport") {
          if (remainingStones.length > 0) {
            // Pick a random stone from the ones currently on the table
            const randomStoneId = remainingStones[Math.floor(Math.random() * remainingStones.length)];
            
            // Only teleport if it's not the stone in the air
            if (randomStoneId !== airStone) {
              // Mark stone as teleporting (will make it invisible)
              setTeleportingStone(randomStoneId);
              
              // Wait a moment, then teleport
              setTimeout(() => {
                setStonePositions(prev => {
                  // Find the stone's current position
                  const stoneIndex = prev.findIndex(s => s.id === randomStoneId);
                  
                  if (stoneIndex === -1) {
                    setTeleportingStone(null);
                    return prev;
                  }
                  
                  // Generate new random position (percentage-based)
                  const stoneSize = 8;
                  const minGap = 12;
                  let newLeft, newBottom;
                  let tries = 0;
                  
                  do {
                    newLeft = 5 + Math.floor(Math.random() * (85 - stoneSize));
                    newBottom = 10 + Math.floor(Math.random() * 40);
                    tries++;
                  } while (
                    prev.some((s, idx) => 
                      idx !== stoneIndex && 
                      Math.abs(s.left - newLeft) < minGap && 
                      Math.abs(s.baseBottom - newBottom) < minGap
                    ) && tries < 100
                  );
                  
                  // Update only this stone's position
                  const newPositions = [...prev];
                  newPositions[stoneIndex] = {
                    ...newPositions[stoneIndex],
                    left: newLeft,
                    baseBottom: newBottom
                  };
                  return newPositions;
                });
                
                // Make stone reappear after position is updated
                setTimeout(() => {
                  setTeleportingStone(null);
                }, 50);
              }, 250);
            }
          }
          
          if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
        }
        
        setTimeout(() => setInterruptEffect(null), 1500);
      }
    });
    return () => unsubscribe();
  }, [roomId, playerId, soundOn]);

  // 🔹 Sync player state to Firebase for live view
  useEffect(() => {
    if (!gameState) return;
    
    const isMyTurnNow = gameState.gameState?.turn === playerId;
    if (!isMyTurnNow) return;

    // Create a snapshot of current state
    const currentState = JSON.stringify({
      remainingStones,
      airStone,
      collectedStones,
      pickedGroup,
      stonePositions,
      isFalling,
    });

    // Only update if state has actually changed
    if (lastSyncedStateRef.current === currentState) return;

    lastSyncedStateRef.current = currentState;
    
    update(ref(db, `rooms/${roomId}/players/${playerId}`), {
      remainingStones,
      airStone,
      collectedStones,
      pickedGroup,
      stonePositions,
      isFalling,
      level: gameState.players?.[playerId]?.level || 1,
    });
  }, [remainingStones, airStone, collectedStones, pickedGroup, stonePositions, isFalling, roomId, playerId, gameState]);

  if (!gameState) return <div>Loading...</div>;

  const players = gameState.players || {};
  const scores = gameState.gameState?.scores || {};
  const playerIds = Object.keys(scores);
  
  // 🏆 Check if game has ended
  const gameEnded = gameState.gameState?.gameEnded || false;
  const winnerId = gameState.gameState?.winner || null;
  
  if (gameEnded && winnerId) {
    const winnerName = winnerId === playerId ? playerName : players[winnerId]?.name || "Unknown";
    const isWinner = winnerId === playerId;
    
    return (
      <div style={{ 
        background: isWinner ? "#2E7D32" : "#C62828", 
        color: "white", 
        minHeight: "100vh", 
        padding: "20px", 
        textAlign: "center",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}>
        <h1 style={{ fontSize: "clamp(36px, 10vw, 48px)", marginTop: "30px" }}>
          {isWinner ? "🎉 YOU WIN! 🎉" : "😔 YOU LOSE"}
        </h1>
        <h2 style={{ fontSize: "clamp(28px, 7vw, 36px)", marginTop: "20px" }}>
          {isWinner ? "Congratulations!" : `${winnerName} Wins!`}
        </h2>
        
        <div style={{ 
          background: "rgba(255,255,255,0.2)", 
          padding: "20px", 
          borderRadius: "20px", 
          margin: "30px auto",
          maxWidth: "400px"
        }}>
          <h3 style={{ fontSize: "clamp(22px, 5.5vw, 28px)", marginBottom: "15px" }}>🏆 Final Scores</h3>
          <ul style={{ listStyle: "none", padding: 0, fontSize: "clamp(18px, 4.5vw, 24px)" }}>
            {Object.entries(scores)
              .sort(([, a], [, b]) => b - a)
              .map(([id, score]) => (
                <li key={id} style={{ 
                  marginBottom: "12px",
                  fontWeight: id === winnerId ? "bold" : "normal",
                  color: id === winnerId ? "#FFD700" : "white"
                }}>
                  {id === playerId ? `${playerName} (You)` : players[id]?.name || id}: {score} 
                  {id === winnerId && " 👑"}
                </li>
              ))}
          </ul>
        </div>
        
        <button
          onClick={() => window.location.reload()}
          onTouchStart={(e) => {
            e.preventDefault();
            window.location.reload();
          }}
          style={{
            padding: "15px 30px",
            fontSize: "clamp(16px, 4vw, 20px)",
            fontWeight: "bold",
            borderRadius: "12px",
            border: "none",
            background: "#FFD700",
            color: "#000",
            cursor: "pointer",
            boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
            transition: "0.2s",
            marginTop: "15px",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent"
          }}
          onMouseEnter={(e) => e.target.style.transform = "scale(1.1)"}
          onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
        >
          🏠 Back to Lobby
        </button>
      </div>
    );
  }

  const isMyTurn = gameState.gameState.turn===playerId;

  // 🔹 Waiting / not your turn: show opponent view
  if (!isMyTurn) {
    const otherPlayerId = playerIds.find(id => id !== playerId);
    if (!otherPlayerId) {
      return <div style={{padding:"40px",fontSize:"24px"}}>Waiting for other players to join...</div>
    }
    const otherPlayerData = players[otherPlayerId] || {};
    const otherRemaining = otherPlayerData.remainingStones ?? [0,1,2,3,4];
    const otherAir = otherPlayerData.airStone ?? null;
    const otherCollected = otherPlayerData.collectedStones ?? [];
    const otherPicked = otherPlayerData.pickedGroup ?? [];
    const otherPositions = otherPlayerData.stonePositions ?? [];
    const otherIsFalling = otherPlayerData.isFalling ?? false;
    const otherLevel = otherPlayerData.level ?? 1;

    return (
      <div style={{ background: "#F3E5AB", color:"#4B3621", minHeight:"100vh", padding:"15px", textAlign:"center", fontFamily:"'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", overflow:"hidden" }}>
        <h2 style={{ fontFamily:"'Courier New', Courier, monospace", fontSize:"clamp(24px, 6vw, 32px)" }}>🪨 Crazy Batu Seremban</h2>
        <h3 style={{ fontSize:"clamp(18px, 4.5vw, 22px)" }}>👀 Watching {otherPlayerData.name || "Opponent"}'s Turn</h3>
        <h4 style={{color:"#D2691E", fontSize:"clamp(16px, 4vw, 18px)"}}>Level {otherLevel}</h4>
        <p style={{ fontSize:"clamp(12px, 3vw, 14px)", color:"#6B4C3B" }}>
          Stones on table: {otherRemaining.length} | In hand: {otherCollected.length}
        </p>

        {/* 🔹 Live Game Table */}
        <div style={{ 
          margin: "20px auto", 
          width: "min(90vw, 500px)", 
          height: "min(40vw, 200px)", 
          background: "#8B4513", 
          borderRadius: "20px", 
          position: "relative", 
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)", 
          border: "5px solid #A0522D",
          touchAction:"manipulation"
        }}>
          {otherRemaining.map((id) => {
            const pos = otherPositions.find(s => s?.id === id) || { left: 5 + id * 18, baseBottom: 10 + (id * 8) };
            const isPicked = otherPicked.includes(id);
            
            return (
              <div
                key={id}
                style={{
                  position: "absolute",
                  bottom: otherAir === id 
                    ? (otherIsFalling ? `${pos.baseBottom}%` : "65%")
                    : `${pos.baseBottom}%`,
                  left: `${pos.left}%`,
                  width: "clamp(30px, 8vw, 40px)",
                  height: "clamp(30px, 8vw, 40px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "clamp(18px, 5vw, 24px)",
                  borderRadius: "50%",
                  backgroundColor: otherAir === id ? "orange" : isPicked ? "gold" : stoneStyle.color,
                  transition: "bottom 0.75s ease",
                  boxShadow: isPicked ? "0 0 10px gold" : "none",
                  userSelect:"none",
                  WebkitUserSelect:"none"
                }}
              >
                {stoneStyle.emoji}
              </div>
            );
          })}

          {/* ✋ Hand to catch airStone */}
          {otherAir !== null && (
            <div
              style={{
                position: "absolute",
                bottom: "85%",
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: "clamp(40px, 10vw, 50px)",
                opacity: 0.9,
                userSelect:"none",
                WebkitUserSelect:"none"
              }}
            >
              ✋
            </div>
          )}
        </div>

        {/* 🔹 Interrupt buttons */}
        <div style={{ marginTop:"20px", display:"flex", gap:"10px", justifyContent:"center", flexWrap:"wrap", padding:"0 10px" }}>
          <button 
            onClick={() => sendInterrupt("earthquake")}
            onTouchStart={(e)=>{
              e.preventDefault();
              sendInterrupt("earthquake");
            }}
            disabled={earthquakeCooldown}
            style={{
              padding:"12px 20px",
              cursor: earthquakeCooldown ? "not-allowed" : "pointer",
              borderRadius:"12px",
              border:"none",
              background: earthquakeCooldown ? "#555" : "#8B0000",
              color:"#fff",
              fontSize:"clamp(14px, 3.5vw, 16px)",
              fontWeight:"bold",
              boxShadow:"0 4px 8px rgba(0,0,0,0.3)",
              transition:"0.2s",
              flex:"1 1 auto",
              minWidth:"120px",
              touchAction:"manipulation",
              WebkitTapHighlightColor:"transparent",
              opacity: earthquakeCooldown ? 0.5 : 1
            }}
            onMouseEnter={(e) => !earthquakeCooldown && (e.target.style.transform = "scale(1.05)")}
            onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
          >
            {earthquakeCooldown ? "⏳ Wait..." : "🌋 EARTHQUAKE"}
          </button>
          <button 
            onClick={() => sendInterrupt("teleport")}
            onTouchStart={(e)=>{
              e.preventDefault();
              sendInterrupt("teleport");
            }}
            disabled={teleportCooldown}
            style={{
              padding:"12px 20px",
              cursor: teleportCooldown ? "not-allowed" : "pointer",
              borderRadius:"12px",
              border:"none",
              background: teleportCooldown ? "#555" : "#9370DB",
              color:"#fff",
              fontSize:"clamp(14px, 3.5vw, 16px)",
              fontWeight:"bold",
              boxShadow:"0 4px 8px rgba(0,0,0,0.3)",
              transition:"0.2s",
              flex:"1 1 auto",
              minWidth:"120px",
              touchAction:"manipulation",
              WebkitTapHighlightColor:"transparent",
              opacity: teleportCooldown ? 0.5 : 1
            }}
            onMouseEnter={(e) => !teleportCooldown && (e.target.style.transform = "scale(1.05)")}
            onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
          >
            {teleportCooldown ? "⏳ Wait..." : "✨ TELEPORT"}
          </button>
        </div>

        {/* 🔹 Scores */}
        <h3 style={{marginTop:"20px", fontSize:"clamp(18px, 4.5vw, 22px)"}}>🏆 Scores</h3>
        <ul style={{listStyle:"none", padding:0, fontSize:"clamp(14px, 3.5vw, 18px)"}}>
          {Object.entries(scores).map(([id,score])=>(
            <li key={id} style={{marginBottom:"8px"}}>
              {id===playerId?`${playerName} (You)`:players[id]?.name||id} : {score}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // 🔹 Player's turn logic
  const playerData = players[playerId]||{};
  const level = playerData.level||1;
  const stonesOnTable = remainingStones.length;
  let required = stonesOnTable===1?0:stonesOnTable<level+1?-1:level;

  const switchTurn = () => {
    const idx = playerIds.indexOf(playerId);
    const nextPlayer = playerIds[(idx+1)%playerIds.length];
    update(ref(db, `rooms/${roomId}/gameState`), {turn: nextPlayer});
  };

  // 🔹 THROW
  const throwStone = (id) => {
    if (!isMyTurn || airStone!==null || required<0) return;
    if(soundOn) play("bg");

    setAirStone(id); setFail(false); setPickedGroup([]); setIsFalling(false);
    if(soundOn) play("toss");
    if(navigator.vibrate) navigator.vibrate(50);

    setTimeout(()=>setIsFalling(true), 750);
    timerRef.current = setTimeout(handleFail, 1500);
  };

  // 🔹 PICK
  const pickStone = (id) => {
    if (!isMyTurn || airStone===null || id===airStone || pickedGroup.includes(id) || pickedGroup.length>=required) return;
    setPickedGroup(prev=>[...prev,id]);
    if(soundOn) play("pick");
  };

  // 🔹 CATCH
  const catchStone = () => {
    if (!isMyTurn || airStone===null || pickedGroup.length!==required) return;

    clearTimeout(timerRef.current);
    setIsFalling(false);
    if(soundOn) play("catch");
    if(navigator.vibrate) navigator.vibrate(80);

    const newCollected = [...collectedStones, airStone];
    const tempRemaining = remainingStones.filter(stone=>!pickedGroup.includes(stone)&&stone!==airStone);

    setCollectedStones(newCollected);
    setAirStone(null);

    if (newCollected.length===5 || tempRemaining.length===0) {
      // Check if player completed level 4 (game winner!)
      if (level >= 4) {
        // Increment score for completing level 4
        update(ref(db, `rooms/${roomId}/gameState/scores`), {[playerId]:(scores[playerId]||0)+1});
        
        // Set winner and end game
        update(ref(db, `rooms/${roomId}/gameState`), {
          winner: playerId,
          gameEnded: true,
        });
        
        setPickedGroup([]);
        setRemainingStones([0,1,2,3,4]);
        setCollectedStones([]);
        generatePositions();
      } else {
        // Move to next level (1->2, 2->3, 3->4)
        const nextLevel = level + 1;
        
        update(ref(db, `rooms/${roomId}/players/${playerId}`), {level:nextLevel});
        update(ref(db, `rooms/${roomId}/gameState/scores`), {[playerId]:(scores[playerId]||0)+1});

        setPickedGroup([]);
        setRemainingStones([0,1,2,3,4]);
        setCollectedStones([]);
        generatePositions();
      }
    } else {
      setRemainingStones(tempRemaining);
      setTimeout(()=>{ setRemainingStones(prev=>[...prev,...pickedGroup]); setPickedGroup([]); }, 500);
    }
  };

  // 🔹 FAIL
  const handleFail = () => {
    setFail(true);
    setIsFalling(true);
    if(soundOn) play("fail");
    if(navigator.vibrate) navigator.vibrate([100,50,100]);
    setTimeout(()=>{
      setAirStone(null); setPickedGroup([]); setIsFalling(false); setFail(false);
      if(collectedStones.length>0){ setRemainingStones([0,1,2,3,4]); setCollectedStones([]); generatePositions();}
      switchTurn();
    }, 800);
  };

  return (
    <div style={{ 
      background: fail?"#7B241C":"#F3E5AB", 
      color:"#4B3621", 
      minHeight:"100vh", 
      padding:"15px", 
      textAlign:"center", 
      fontFamily:"'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", 
      transition:"0.2s", 
      position:"relative",
      animation: interruptEffect === "earthquake" ? "earthquake 0.5s" : "none",
      overflow:"hidden"
    }}>

      <h2 style={{ fontFamily:"'Courier New', Courier, monospace", fontSize:"clamp(24px, 6vw, 32px)", marginBottom:"5px" }}>🪨 Crazy Batu Seremban</h2>
      <h3 style={{ fontSize:"clamp(18px, 4.5vw, 22px)", marginBottom:"5px" }}>Level {level} — Pick {required>=0?required:"N/A"}</h3>
      <h4 style={{ fontSize:"clamp(16px, 4vw, 18px)" }}>{isMyTurn?"🟢 Your Turn":"🔴 Waiting"}</h4>
      <p style={{ fontSize:"clamp(12px, 3vw, 14px)", color:"#6B4C3B", marginBottom:"10px" }}>Stones on table: {remainingStones.length} | In hand: {collectedStones.length}</p>

      <button 
        onClick={()=>setSoundOn(prev=>!prev)} 
        style={{
          padding:"8px 16px",
          marginBottom:"10px",
          cursor:"pointer",
          borderRadius:"8px",
          border:"none",
          background:"#D2691E",
          color:"#fff",
          fontSize:"clamp(12px, 3vw, 14px)",
          touchAction:"manipulation",
          WebkitTapHighlightColor:"transparent"
        }}>
        {soundOn ? "🔊 Sound On" : "🔇 Sound Off"}
      </button>

      {fail && <h2 style={{ color:"red", fontSize:"clamp(20px, 5vw, 28px)", margin:"10px 0" }}>FAILED!</h2>}

      {/* 🔹 Game Table */}
      <div style={{ 
        margin:"20px auto", 
        width:"min(90vw, 500px)", 
        height:"min(40vw, 200px)", 
        background:"#8B4513", 
        borderRadius:"20px", 
        position:"relative", 
        boxShadow:"0 10px 40px rgba(0,0,0,0.5)", 
        border:"5px solid #A0522D",
        animation: interruptEffect === "earthquake" ? "tableShake 0.5s" : "none",
        touchAction:"manipulation"
      }}>
        {remainingStones.map(id=>{
          const pos = stonePositions.find(s=>s.id===id); if(!pos) return null;
          const isTeleporting = teleportingStone === id;
          return (
            <div
              key={id}
              onClick={()=> required>=0 && isMyTurn ? airStone===null?throwStone(id):pickStone(id):null }
              onTouchStart={(e)=> {
                e.preventDefault();
                if(required>=0 && isMyTurn) {
                  airStone===null?throwStone(id):pickStone(id);
                }
              }}
              style={{
                position:"absolute",
                bottom: airStone === id
                  ? isFalling
                    ? `${pos.baseBottom}%`
                    : "65%"
                  : `${pos.baseBottom}%`,
                left:`${pos.left}%`,
                width:"clamp(30px, 8vw, 40px)",
                height:"clamp(30px, 8vw, 40px)",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                fontSize:"clamp(18px, 5vw, 24px)",
                cursor:isMyTurn && required>=0?"pointer":"default",
                borderRadius:"50%",
                backgroundColor: airStone === id ? "orange" : pickedGroup.includes(id) ? "gold" : stoneStyle.color,
                transition: isTeleporting ? "opacity 0.25s ease" : "bottom 0.75s ease",
                opacity: isTeleporting ? 0 : 1,
                boxShadow: pickedGroup.includes(id) ? "0 0 10px gold" : isTeleporting ? "0 0 20px purple" : "none",
                touchAction:"manipulation",
                WebkitTapHighlightColor:"transparent",
                userSelect:"none",
                WebkitUserSelect:"none"
              }}
            >
              {stoneStyle.emoji}
            </div>
          )
        })}

        {/* ✋ Hand to catch airStone */}
        {airStone !== null && (
          <div 
            onClick={catchStone}
            onTouchStart={(e)=>{
              e.preventDefault();
              catchStone();
            }}
            style={{ 
              position:"absolute", 
              bottom:"85%", 
              left:"50%", 
              transform:"translateX(-50%)", 
              fontSize:"clamp(40px, 10vw, 50px)", 
              cursor:"pointer", 
              transition:"0.2s",
              touchAction:"manipulation",
              WebkitTapHighlightColor:"transparent",
              userSelect:"none",
              WebkitUserSelect:"none"
            }}>
            ✋
          </div>
        )}

        {/* 🔹 Interrupt visual effects */}
        {interruptEffect==="earthquake" && (
          <div style={{ 
            position:"absolute", 
            inset:0, 
            background:"rgba(139,69,19,0.4)", 
            animation:"earthquakeOverlay 0.5s",
            pointerEvents:"none"
          }} />
        )}

      </div>

      {/* 🔹 Scores */}
      <h3 style={{ fontSize:"clamp(18px, 4.5vw, 22px)", marginTop:"20px" }}>🏆 Scores</h3>
      <ul style={{listStyle:"none", padding:0, fontSize:"clamp(14px, 3.5vw, 16px)"}}>
        {Object.entries(scores).map(([id,score])=>(<li key={id} style={{marginBottom:"5px"}}>{id===playerId?playerName:players[id]?.name||id} : {score}</li>))}
      </ul>

      {/* 🔹 Animations */}
      <style>{`
        @keyframes earthquake {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-10px, -10px); }
          20% { transform: translate(10px, 10px); }
          30% { transform: translate(-10px, 10px); }
          40% { transform: translate(10px, -10px); }
          50% { transform: translate(-10px, -10px); }
          60% { transform: translate(10px, 10px); }
          70% { transform: translate(-10px, 10px); }
          80% { transform: translate(10px, -10px); }
          90% { transform: translate(-10px, -10px); }
        }
        @keyframes tableShake {
          0%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(-3deg) translate(-5px, 0); }
          20% { transform: rotate(3deg) translate(5px, 0); }
          30% { transform: rotate(-3deg) translate(-5px, 0); }
          40% { transform: rotate(3deg) translate(5px, 0); }
          50% { transform: rotate(-3deg) translate(-5px, 0); }
          60% { transform: rotate(3deg) translate(5px, 0); }
          70% { transform: rotate(-3deg) translate(-5px, 0); }
          80% { transform: rotate(3deg) translate(5px, 0); }
          90% { transform: rotate(-3deg) translate(-5px, 0); }
        }
        @keyframes earthquakeOverlay {
          0%, 100% { opacity: 0; }
          50% { opacity: 0.6; }
        }
      `}</style>

    </div>
  )
}
