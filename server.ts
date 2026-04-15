import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Constants
  const WORLD_WIDTH = 80;
  const WORLD_DEPTH = 60;
  const BASE_SIZE = 6;
  const TICK_RATE = 20; // 20 ticks per second

  // Game State
  const players: Record<string, any> = {};
  let gameState = {
    status: 'START' as 'START' | 'PLAYING' | 'GAMEOVER' | 'UPGRADE' | 'PAUSED',
    gameMode: 'PVE' as 'PVE' | 'PVP',
    pvpTimer: 30,
    gameOverReason: 'BASE_FELL' as 'BASE_FELL' | 'PLAYER_DIED' | 'PVP_ATTACKERS_WIN' | 'PVP_DEFENDERS_WIN',
    wave: 1,
    baseHp: 500,
    enemies: [] as any[],
    projectiles: [] as any[],
    enemiesSpawned: 0,
    enemiesToSpawn: 10,
    countdown: null as number | null,
    upgrades: {
      baseDefense: 1,
      baseRegen: 1,
    }
  };

  let nextEntityId = 1;
  const getNextId = () => nextEntityId++;

  const spawnEnemy = () => {
    const side = Math.floor(Math.random() * 4);
    let x = 0, z = 0;
    if (side === 0) { x = -WORLD_WIDTH / 2 - 5; z = (Math.random() - 0.5) * WORLD_DEPTH; }
    else if (side === 1) { x = WORLD_WIDTH / 2 + 5; z = (Math.random() - 0.5) * WORLD_DEPTH; }
    else if (side === 2) { x = (Math.random() - 0.5) * WORLD_WIDTH; z = -WORLD_DEPTH / 2 - 5; }
    else { x = (Math.random() - 0.5) * WORLD_WIDTH; z = WORLD_DEPTH / 2 + 5; }

    const enemyTypes = ['scout', 'infantry', 'heavy', 'archer', 'commander'];
    const weights = [40, 30, 15, 10, 5];
    let rand = Math.random() * 100;
    let typeIndex = 0;
    for (let i = 0; i < weights.length; i++) {
      if (rand < weights[i]) { typeIndex = i; break; }
      rand -= weights[i];
    }
    const enemyType = enemyTypes[typeIndex];

    const enemy = {
      id: getNextId(),
      x, z,
      hp: enemyType === 'commander' ? 200 : (enemyType === 'heavy' ? 100 : 30),
      maxHp: enemyType === 'commander' ? 200 : (enemyType === 'heavy' ? 100 : 30),
      enemyType,
      speed: enemyType === 'scout' ? 1.5 : (enemyType === 'heavy' ? 0.6 : 1),
      size: enemyType === 'commander' ? 2.5 : (enemyType === 'heavy' ? 1.8 : 1.2),
      rotation: 0,
      cooldown: 0,
      chargeTimer: 0,
      lungeTimer: 0,
      lungeDir: { x: 0, z: 0 },
      hitFlash: 0
    };
    gameState.enemies.push(enemy);
    gameState.enemiesSpawned++;
  };

  // Game Loop
  setInterval(() => {
    // Countdown logic
    if (gameState.countdown !== null) {
      const playerList = Object.values(players);
      let canStart = false;
      
      if (gameState.gameMode === 'PVE') {
        canStart = playerList.length > 0 && playerList.every((p: any) => p.ready);
      } else {
        const defenders = playerList.filter((p: any) => p.team === 'defender');
        const attackers = playerList.filter((p: any) => p.team === 'attacker');
        canStart = playerList.length >= 2 && 
                   defenders.length >= 1 && 
                   attackers.length >= 1 && 
                   playerList.every((p: any) => p.ready);
      }

      if (!canStart) {
        gameState.countdown = null;
      } else {
        gameState.countdown -= 1 / TICK_RATE;
        if (gameState.countdown <= 0) {
          gameState.countdown = null;
          startGame();
        }
      }
    }

    if (gameState.status !== 'PLAYING') {
      io.emit("gameStateUpdate", { ...gameState, players });
      return;
    }

    // PVP Logic
    if (gameState.gameMode === 'PVP') {
      gameState.pvpTimer -= 1 / TICK_RATE;
      if (gameState.pvpTimer <= 0) {
        gameState.status = 'GAMEOVER';
        gameState.gameOverReason = 'PVP_DEFENDERS_WIN';
      }
    }

    // Spawning logic (PVE only)
    if (gameState.gameMode === 'PVE' && gameState.enemiesSpawned < gameState.enemiesToSpawn && Math.random() < 0.05) {
      spawnEnemy();
      console.log(`Enemy spawned: ${gameState.enemiesSpawned}/${gameState.enemiesToSpawn}`);
    }

    // Player Regeneration and Flash Reset
    const maxBaseHp = 500 + (gameState.upgrades.baseDefense - 1) * 100;
    const baseRegen = (gameState.upgrades.baseRegen - 1) * 0.05;
    if (baseRegen > 0 && gameState.baseHp < maxBaseHp) {
      gameState.baseHp = Math.min(maxBaseHp, gameState.baseHp + baseRegen);
    }

    const playerList = Object.values(players);
    playerList.forEach((player: any) => {
      if (player.hitFlash > 0) player.hitFlash -= 1;
      if (player.respawnTimer > 0) {
        player.respawnTimer -= 1 / TICK_RATE;
        if (player.respawnTimer <= 0) {
          player.hp = 100 + (player.upgrades.playerMaxHp - 1) * 20;
          if (gameState.gameMode === 'PVP') {
            if (player.team === 'attacker') {
              player.x = 38;
              player.z = (Math.random() - 0.5) * 20;
            } else {
              player.x = -10;
              player.z = (Math.random() - 0.5) * 10;
            }
          } else {
            player.x = -10;
            player.z = 0;
          }
        }
      }
      
      // Player Regen
      const maxPlayerHp = 100 + (player.upgrades.playerMaxHp - 1) * 20;
      const playerRegen = (player.upgrades.playerRegen - 1) * 0.05;
      if (playerRegen > 0 && player.hp < maxPlayerHp) {
        player.hp = Math.min(maxPlayerHp, player.hp + playerRegen);
      }
    });

    // Enemy AI
    gameState.enemies.forEach(enemy => {
      if (enemy.hitFlash > 0) enemy.hitFlash -= 1;
      if (enemy.cooldown > 0) enemy.cooldown -= 1;
      if (enemy.chargeTimer > 0) enemy.chargeTimer -= 1;
      if (enemy.lungeTimer > 0) enemy.lungeTimer -= 1;

      // Commander Healing (if not hit recently)
      if (enemy.enemyType === 'commander' && enemy.hitFlash === 0 && enemy.hp < enemy.maxHp) {
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + 0.1);
      }

      const dx = -enemy.x;
      const dz = -enemy.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist > 0.1) {
        if (enemy.enemyType === 'archer') {
          const targetDist = 20;
          if (dist > targetDist + 1) {
            enemy.x += (dx / dist) * enemy.speed * 0.1;
            enemy.z += (dz / dist) * enemy.speed * 0.1;
          } else if (dist < targetDist - 1) {
            enemy.x -= (dx / dist) * enemy.speed * 0.1;
            enemy.z -= (dz / dist) * enemy.speed * 0.1;
          }
          
          // Shooting logic
          if (enemy.cooldown <= 0) {
            enemy.cooldown = 45; // 1.5 seconds
            const angle = Math.atan2(dz, dx);
            gameState.projectiles.push({
              id: getNextId(),
              x: enemy.x,
              z: enemy.z,
              vx: Math.cos(angle) * 0.8,
              vz: Math.sin(angle) * 0.8,
              enemyType: 'archer',
              damage: 15
            });
          }
        } else {
          // Find nearest player
          let nearestPlayer: any = null;
          let minDist = 15; // Aggro range

          for (const player of playerList) {
            const pdx = player.x - enemy.x;
            const pdz = player.z - enemy.z;
            const pdist = Math.sqrt(pdx * pdx + pdz * pdz);
            if (pdist < minDist) {
              minDist = pdist;
              nearestPlayer = player;
            }
          }

          if (nearestPlayer && enemy.chargeTimer === 0 && enemy.lungeTimer === 0 && enemy.cooldown === 0) {
            // Start charging if close to player
            if (minDist < 8) {
              enemy.chargeTimer = 30; // 1 second charge
            }
          }

          if (enemy.chargeTimer > 0) {
            // Charging: stay still, rotation handled below
            if (nearestPlayer) {
              const pdx = nearestPlayer.x - enemy.x;
              const pdz = nearestPlayer.z - enemy.z;
              enemy.rotation = -Math.atan2(pdz, pdx) + Math.PI / 2;
            }

            if (enemy.chargeTimer === 1) {
              // Start Lunge at the end of charge
              if (nearestPlayer) {
                const pdx = nearestPlayer.x - enemy.x;
                const pdz = nearestPlayer.z - enemy.z;
                const pdist = Math.sqrt(pdx * pdx + pdz * pdz);
                
                if (pdist > 0.1) {
                  enemy.lungeTimer = 15; // 0.5 seconds lunge
                  enemy.lungeDir = { x: pdx / pdist, z: pdz / pdist };
                }
              }
              enemy.cooldown = 60; // 2 second cooldown after attack
            }
          } else if (enemy.lungeTimer > 0) {
            // Lunging movement
            const lungeSpeed = 0.4; // 6 units over 15 ticks
            enemy.x += enemy.lungeDir.x * lungeSpeed;
            enemy.z += enemy.lungeDir.z * lungeSpeed;

            // Check for damage during lunge
            for (const player of playerList) {
              const pdx = player.x - enemy.x;
              const pdz = player.z - enemy.z;
              const pdist = Math.sqrt(pdx * pdx + pdz * pdz);
              if (pdist < 2.5) {
                player.hp = Math.max(0, (player.hp || 100) - 1.0); // Continuous damage during lunge
                player.hitFlash = 5;
                if (player.hp <= 0) {
                  if (gameState.gameMode === 'PVP') {
                    player.respawnTimer = 3;
                    player.killedBy = enemy.enemyType;
                    player.x = 999;
                    player.z = 999;
                  } else {
                    gameState.status = 'GAMEOVER';
                    gameState.gameOverReason = 'PLAYER_DIED';
                  }
                }
              }
            }
          } else {
            // Move towards base or player
            if (dist > BASE_SIZE / 2) {
              enemy.x += (dx / dist) * enemy.speed * 0.1;
              enemy.z += (dz / dist) * enemy.speed * 0.1;
              enemy.rotation = -Math.atan2(dz, dx) + Math.PI / 2;
            } else {
              gameState.baseHp = Math.max(0, gameState.baseHp - 0.2);
              if (gameState.baseHp <= 0) {
                gameState.status = 'GAMEOVER';
                gameState.gameOverReason = 'BASE_FELL';
              }
            }
          }
        }

        // Passive player damage (if they touch)
        for (const player of playerList) {
          const pdx = player.x - enemy.x;
          const pdz = player.z - enemy.z;
          const pdist = Math.sqrt(pdx * pdx + pdz * pdz);
          if (pdist < 2.0) {
            player.hp = Math.max(0, (player.hp || 100) - 0.1);
            player.hitFlash = 5;
            if (player.hp <= 0) {
              if (gameState.gameMode === 'PVP') {
                player.respawnTimer = 3;
                player.killedBy = 'contact';
                player.x = 999;
                player.z = 999;
              } else {
                gameState.status = 'GAMEOVER';
                gameState.gameOverReason = 'PLAYER_DIED';
              }
            }
          }
        }
      }
    });

    // Projectile movement
    gameState.projectiles = gameState.projectiles.filter(p => {
      p.x += p.vx;
      p.z += p.vz;

      // Hit base
      const distToBase = Math.sqrt(p.x * p.x + p.z * p.z);
      if (distToBase < BASE_SIZE / 2) {
        gameState.baseHp = Math.max(0, gameState.baseHp - p.damage);
        if (gameState.baseHp <= 0) {
          gameState.status = 'GAMEOVER';
          gameState.gameOverReason = 'BASE_FELL';
        }
        return false;
      }

      // Hit players
      let hitPlayer = false;
      for (const player of playerList) {
        const pdx = player.x - p.x;
        const pdz = player.z - p.z;
        const pdist = Math.sqrt(pdx * pdx + pdz * pdz);
        if (pdist < 1.5) {
          player.hp = Math.max(0, (player.hp || 100) - p.damage);
          player.hitFlash = 10;
          if (player.hp <= 0) {
            if (gameState.gameMode === 'PVP') {
              player.respawnTimer = 3;
              player.killedBy = 'projectile';
              player.x = 999;
              player.z = 999;
            } else {
              gameState.status = 'GAMEOVER';
              gameState.gameOverReason = 'PLAYER_DIED';
            }
          }
          hitPlayer = true;
          break;
        }
      }
      if (hitPlayer) return false;

      // Out of bounds
      if (Math.abs(p.x) > WORLD_WIDTH || Math.abs(p.z) > WORLD_DEPTH) return false;

      return true;
    });

    // Wave Progression
    if (gameState.enemies.length === 0 && gameState.enemiesSpawned >= gameState.enemiesToSpawn) {
      gameState.status = 'UPGRADE'; // Show upgrade screen
      gameState.wave++;
      gameState.enemiesSpawned = 0;
      gameState.enemiesToSpawn = 10 + gameState.wave * 5;
      // Heal base slightly on wave completion
      const maxBaseHp = 500 + (gameState.upgrades.baseDefense - 1) * 100;
      gameState.baseHp = Math.min(maxBaseHp, gameState.baseHp + 50);
    }

    // Broadcast state
    io.emit("gameStateUpdate", { ...gameState, players });

  }, 1000 / TICK_RATE);

  const startGame = () => {
    if (gameState.status === 'GAMEOVER' || gameState.status === 'START') {
      gameState.wave = 1;
      gameState.baseHp = 500;
      gameState.enemiesToSpawn = 10;
      gameState.pvpTimer = 30;
      gameState.upgrades = {
        baseDefense: 1,
        baseRegen: 1,
      };
      // Reset all players honor and upgrades on new game
      Object.values(players).forEach((player: any) => {
        player.honor = gameState.gameMode === 'PVP' ? 500 : 0; // Give some starting honor in PVP
        player.respawnTimer = 0;
        player.killedBy = null;
        player.upgrades = {
          damage: 1,
          speed: 1,
          shockwave: 1,
          reach: 1,
          playerRegen: 1,
          playerMaxHp: 1,
        };
      });
    }
    // Reset all players HP and ready status
    Object.values(players).forEach((player: any) => {
      player.hp = 100 + (player.upgrades.playerMaxHp - 1) * 20;
      player.ready = false;
      player.respawnTimer = 0;
      player.killedBy = null;
      // Set starting positions
      if (gameState.gameMode === 'PVP') {
        if (player.team === 'attacker') {
          player.x = 38;
          player.z = (Math.random() - 0.5) * 20;
        } else {
          player.x = -10;
          player.z = (Math.random() - 0.5) * 10;
        }
      } else {
        player.x = -10;
        player.z = 0;
      }
    });
    gameState.status = 'PLAYING';
    gameState.enemies = [];
    gameState.projectiles = [];
    gameState.enemiesSpawned = 0;
    io.emit("gameStateUpdate", { ...gameState, players });
  };

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);

    if (Object.keys(players).length >= 6) {
      socket.emit("error", "Server is full (max 6 players)");
      socket.disconnect();
      return;
    }

    // Initialize player
    players[socket.id] = {
      id: socket.id,
      name: `Player ${socket.id.slice(0, 4)}`,
      team: 'defender',
      x: 0,
      z: 0,
      facing: 0,
      hp: 100,
      hitFlash: 0,
      attackTrigger: 0,
      shockwaveTrigger: 0,
      honor: 0,
      ready: false,
      respawnTimer: 0,
      killedBy: null,
      upgrades: {
        damage: 1,
        speed: 1,
        shockwave: 1,
        reach: 1,
        playerRegen: 1,
        playerMaxHp: 1,
      }
    };

    // Send initial state
    socket.emit("init", { id: socket.id, players, gameState });

    // Broadcast new player
    socket.broadcast.emit("playerJoined", players[socket.id]);

    socket.on("setReady", (ready: boolean) => {
      if (players[socket.id]) {
        players[socket.id].ready = ready;
        
        // Check if everyone is ready to start countdown
        const playerList = Object.values(players);
        let canStart = false;
        
        if (gameState.gameMode === 'PVE') {
          canStart = playerList.length > 0 && playerList.every((p: any) => p.ready);
        } else {
          const defenders = playerList.filter((p: any) => p.team === 'defender');
          const attackers = playerList.filter((p: any) => p.team === 'attacker');
          canStart = playerList.length >= 2 && 
                     defenders.length >= 1 && 
                     attackers.length >= 1 && 
                     playerList.every((p: any) => p.ready);
        }
        
        if (canStart && (gameState.status === 'START' || gameState.status === 'UPGRADE' || gameState.status === 'GAMEOVER')) {
          if (gameState.countdown === null) {
            gameState.countdown = 3; // 3 second countdown
          }
        } else {
          gameState.countdown = null;
        }
        
        io.emit("gameStateUpdate", { ...gameState, players });
      }
    });

    socket.on("switchTeam", (team: 'defender' | 'attacker') => {
      if (players[socket.id] && gameState.status === 'START') {
        players[socket.id].team = team;
        players[socket.id].ready = false;
        // Set initial position based on team
        if (team === 'attacker') {
          players[socket.id].x = 38;
          players[socket.id].z = (Math.random() - 0.5) * 20;
        } else {
          players[socket.id].x = -10;
          players[socket.id].z = (Math.random() - 0.5) * 10;
        }
        gameState.countdown = null;
        io.emit("gameStateUpdate", { ...gameState, players });
      }
    });

    socket.on("switchMode", (mode: 'PVE' | 'PVP') => {
      const playerList = Object.keys(players);
      if (playerList[0] === socket.id && gameState.status === 'START') {
        gameState.gameMode = mode;
        // Reset readiness when mode changes
        Object.values(players).forEach((p: any) => p.ready = false);
        gameState.countdown = null;
        io.emit("gameStateUpdate", { ...gameState, players });
      }
    });

    socket.on("startGame", () => {
      // Manual start is now handled by ready system, but keeping for compatibility if needed
      // or we can just ignore it and force ready system
    });

    socket.on("pauseGame", () => {
      if (gameState.status === 'PLAYING') {
        gameState.status = 'PAUSED';
        io.emit("gameStateUpdate", { ...gameState, players });
      }
    });

    socket.on("resumeGame", () => {
      if (gameState.status === 'PAUSED') {
        gameState.status = 'PLAYING';
        io.emit("gameStateUpdate", { ...gameState, players });
      }
    });

    socket.on("quitGame", () => {
      gameState.status = 'START';
      gameState.enemies = [];
      gameState.projectiles = [];
      gameState.enemiesSpawned = 0;
      gameState.wave = 1;
      gameState.baseHp = 500;
      gameState.countdown = null;
      Object.values(players).forEach((player: any) => {
        player.honor = 0;
        player.ready = false;
      });
      io.emit("gameStateUpdate", { ...gameState, players });
    });

    socket.on("restartWave", () => {
      gameState.status = 'PLAYING';
      gameState.enemies = [];
      gameState.projectiles = [];
      gameState.enemiesSpawned = 0;
      // Reset all players HP
      Object.values(players).forEach((player: any) => {
        player.hp = 100 + (player.upgrades.playerMaxHp - 1) * 20;
      });
      io.emit("gameStateUpdate", { ...gameState, players });
    });

    socket.on("buyUpgrade", (data) => {
      const { type, cost } = data;
      const player = players[socket.id];
      if (player && player.honor >= cost) {
        player.honor -= cost;
        if (type === 'baseDefense' || type === 'baseRegen') {
          (gameState.upgrades as any)[type] += 1;
        } else {
          (player.upgrades as any)[type] += 1;
        }
        io.emit("gameStateUpdate", { ...gameState, players });
      }
    });

    socket.on("move", (data) => {
      if (players[socket.id] && players[socket.id].hp > 0 && players[socket.id].respawnTimer <= 0) {
        players[socket.id].x = data.x;
        players[socket.id].z = data.z;
        players[socket.id].facing = data.facing;
        socket.broadcast.emit("playerMoved", players[socket.id]);
      }
    });

    socket.on("attack", () => {
      if (players[socket.id] && players[socket.id].hp > 0) {
        players[socket.id].attackTrigger++;
        socket.broadcast.emit("playerAttacked", { id: socket.id });

        const player = players[socket.id];
        const ATTACK_RANGE = 12 + (player.upgrades.reach - 1) * 2;
        const damage = 50 * player.upgrades.damage;
        const facing = player.facing;

        // Damage base if attacker
        if (gameState.gameMode === 'PVP' && player.team === 'attacker') {
          const distToBase = Math.sqrt(player.x * player.x + player.z * player.z);
          if (distToBase < ATTACK_RANGE + BASE_SIZE / 2) {
            const angleToBase = Math.atan2(-player.z, -player.x);
            let angleDiff = Math.abs(angleToBase - facing);
            while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - 2 * Math.PI);
            
            if (angleDiff < Math.PI / 3) {
              gameState.baseHp = Math.max(0, gameState.baseHp - damage);
              if (gameState.baseHp <= 0) {
                gameState.status = 'GAMEOVER';
                gameState.gameOverReason = 'PVP_ATTACKERS_WIN';
              }
            }
          }
        }

        // Damage enemies (PVE)
        gameState.enemies = gameState.enemies.filter(enemy => {
          const dx = enemy.x - player.x;
          const dz = enemy.z - player.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          
          if (dist < ATTACK_RANGE) {
            const angleToEnemy = Math.atan2(dz, dx);
            let angleDiff = Math.abs(angleToEnemy - facing);
            while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - 2 * Math.PI);
            
            if (angleDiff < Math.PI / 3) {
              enemy.hp -= damage;
              enemy.hitFlash = 5;
              if (enemy.hp <= 0) {
                const honorGain = enemy.enemyType === 'commander' ? 500 : (enemy.enemyType === 'heavy' ? 100 : 50);
                Object.values(players).forEach((p: any) => {
                  p.honor += honorGain;
                });
                return false;
              }
            }
          }
          return true;
        });

        // Damage other players (PVP)
        if (gameState.gameMode === 'PVP') {
          Object.values(players).forEach((other: any) => {
            if (other.id !== player.id && other.team !== player.team && other.hp > 0) {
              const dx = other.x - player.x;
              const dz = other.z - player.z;
              const dist = Math.sqrt(dx * dx + dz * dz);
              
              if (dist < ATTACK_RANGE) {
                const angleToOther = Math.atan2(dz, dx);
                let angleDiff = Math.abs(angleToOther - facing);
                while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - 2 * Math.PI);
                
                if (angleDiff < Math.PI / 3) {
                  other.hp = Math.max(0, other.hp - damage);
                  other.hitFlash = 5;
                  if (other.hp <= 0) {
                    other.respawnTimer = 3;
                    other.killedBy = player.name;
                    // Move to purgatory while dead
                    other.x = 999;
                    other.z = 999;
                  }
                }
              }
            }
          });
        }
      }
    });

    socket.on("shockwave", () => {
      if (players[socket.id]) {
        players[socket.id].shockwaveTrigger++;
        socket.broadcast.emit("playerShockwaved", { id: socket.id });

        const player = players[socket.id];
        const RANGE = 25 + (player.upgrades.shockwave - 1) * 4;
        const damage = 100 * player.upgrades.damage;
        gameState.enemies = gameState.enemies.filter(enemy => {
          const dx = enemy.x - player.x;
          const dz = enemy.z - player.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          
          if (dist < RANGE) {
            enemy.hp -= damage;
            enemy.hitFlash = 10;
            if (enemy.hp <= 0) {
              Object.values(players).forEach((p: any) => {
                p.honor += 50;
              });
              return false;
            }
          }
          return true;
        });
      }
    });

    socket.on("disconnect", () => {
      console.log(`Player disconnected: ${socket.id}`);
      delete players[socket.id];
      
      // Unready all other players when someone leaves
      Object.values(players).forEach((p: any) => {
        p.ready = false;
      });
      gameState.countdown = null;

      io.emit("playerLeft", socket.id);
      io.emit("gameStateUpdate", { ...gameState, players });
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
