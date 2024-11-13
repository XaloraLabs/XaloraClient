const loadConfig = require("../handlers/config");
const settings = loadConfig("./config.toml");
const chalk = require("chalk");

/**
 * AFK System Module
 * Handles user AFK rewards, events, achievements, and progression
 */

// Game mechanics configuration
const CONSTANTS = {
    // Core mechanics
    BASE_COINS_PER_MINUTE: 2.5,
    BASE_XP_PER_MINUTE: 10,
    XP_PER_LEVEL: 100,
    MAX_COINS_PER_PING: 10, // Anti-cheat: max coins per ping interval
    MAX_SESSION_INACTIVE_TIME: 5 * 60 * 1000, // 5 minutes
    
    // Multipliers and bonuses
    STREAK_MULTIPLIER: 0.35,
    STREAK_RESET_HOURS: 36,
    LEVEL_BONUS_MULTIPLIER: 0.1, // 10% per level
    PARTY_SIZE_THRESHOLD: 30,
    
    // Events configuration
    COIN_RAIN_INTERVAL: 45 * 60 * 1000, // 45 minutes
    COIN_RAIN_DURATION: 30 * 1000, // 30 seconds
    COIN_RAIN_MIN_COINS: 5,
    COIN_RAIN_MAX_COINS: 20,
    
    TREASURE_CHEST_MIN_INTERVAL: 15 * 60 * 1000, // 15 minutes
    TREASURE_CHEST_MAX_INTERVAL: 30 * 60 * 1000, // 30 minutes
    TREASURE_CHEST_DURATION: 60 * 1000, // 1 minute
    TREASURE_CHEST_MIN_REWARD: 100,
    TREASURE_CHEST_MAX_REWARD: 1000,
    
    // Rate limiting
    MIN_PING_INTERVAL: 900, // Minimum 0.9 seconds between pings
    MAX_EVENTS_PER_MINUTE: 60
};

// Achievement definitions with tiers
const ACHIEVEMENTS = {
    afkTime: [
        { id: 'afk_1h', name: '1 Hour Club', description: 'AFK for 1 hour total', requirement: 3600, reward: 100, icon: '⭐' },
        { id: 'afk_24h', name: 'Day Dreamer', description: 'AFK for 24 hours total', requirement: 86400, reward: 500, icon: '🌙' },
        { id: 'afk_7d', name: 'Week Warrior', description: 'AFK for 7 days total', requirement: 604800, reward: 2000, icon: '👑' },
        { id: 'afk_30d', name: 'Monthly Master', description: 'AFK for 30 days total', requirement: 2592000, reward: 10000, icon: '🌟' }
    ],
    coins: [
        { id: 'coins_1k', name: 'Pocket Change', description: 'Earn 1,000 coins', requirement: 1000, reward: 100, icon: '💰' },
        { id: 'coins_10k', name: 'Money Maker', description: 'Earn 10,000 coins', requirement: 10000, reward: 500, icon: '💎' },
        { id: 'coins_100k', name: 'Fortune Finder', description: 'Earn 100,000 coins', requirement: 100000, reward: 2000, icon: '🏆' },
        { id: 'coins_1m', name: 'Millionaire', description: 'Earn 1,000,000 coins', requirement: 1000000, reward: 10000, icon: '💫' }
    ],
    events: [
        { id: 'rain_1', name: 'Rain Dancer', description: 'Collect from 1 coin rain', requirement: 1, reward: 50, icon: '🌧️' },
        { id: 'rain_10', name: 'Storm Chaser', description: 'Collect from 10 coin rains', requirement: 10, reward: 200, icon: '⛈️' },
        { id: 'chest_1', name: 'Treasure Hunter', description: 'Open 1 treasure chest', requirement: 1, reward: 50, icon: '📦' },
        { id: 'chest_10', name: 'Master Looter', description: 'Open 10 treasure chests', requirement: 10, reward: 200, icon: '🎁' }
    ],
    streaks: [
        { id: 'streak_3', name: 'Consistent', description: 'Maintain a 3-day streak', requirement: 3, reward: 150, icon: '📅' },
        { id: 'streak_7', name: 'Dedicated', description: 'Maintain a 7-day streak', requirement: 7, reward: 500, icon: '🎯' },
        { id: 'streak_30', name: 'Loyal Legend', description: 'Maintain a 30-day streak', requirement: 30, reward: 2000, icon: '🏅' }
    ]
};

// Rate limiting and anti-cheat tracking
const rateLimits = new Map();

class RateLimit {
    constructor(userId) {
        this.userId = userId;
        this.lastPing = 0;
        this.eventCount = 0;
        this.eventResetTimeout = null;
    }

    canPing() {
        const now = Date.now();
        if (now - this.lastPing < CONSTANTS.MIN_PING_INTERVAL) {
            return false;
        }
        this.lastPing = now;
        return true;
    }

    trackEvent() {
        this.eventCount++;
        if (this.eventCount > CONSTANTS.MAX_EVENTS_PER_MINUTE) {
            return false;
        }
        if (!this.eventResetTimeout) {
            this.eventResetTimeout = setTimeout(() => {
                this.eventCount = 0;
                this.eventResetTimeout = null;
            }, 60000);
        }
        return true;
    }
}

/* Manifest */
const Manifest = { "name": "AFK Page", "api_level": 6, "target_platform": "3.0.0" };

/*
 * ------------------------------------------------------------------------------------------------
 * Heliactyl module loader & compatibility check
 * ------------------------------------------------------------------------------------------------
*/
function isLegacyVersion(version) {
  /* check if version starts with 12, 14, 18, or 19 */
  const legacyPrefixes = ['12.', '14.', '18.', '19.'];
  return legacyPrefixes.some(prefix => version.startsWith(prefix));
}

if (isLegacyVersion(Manifest.target_platform)) {
  console.log(`Couldn't load module: "${Manifest.name}" is a Heliactyl Legacy module and cannot run on Heliactyl Next.`);
  process.exit();
} else if (Manifest.target_platform !== settings.version) {
  console.log(`Couldn't load module: "${Manifest.name}" does not support this version of Heliactyl Next. The module was built for v${Manifest.target_platform} but is trying to run on version v${settings.version}.`);
  process.exit();
}
/*
 * ------------------------------------------------------------------------------------------------
 * Module implementation
 * ------------------------------------------------------------------------------------------------
*/
module.exports.heliactylModule = Manifest; /* legacy support */
module.exports.load = async function(app, db) {
    // Track active users and their events
    const activeUsers = new Set();
    const userEvents = new Map();
    const sessionCache = new Map();

    // Database interaction helpers
    const dbHelper = {
        async getSession(userId) {
            return sessionCache.get(userId) || await db.get(`afk_session_${userId}`);
        },

        async saveSession(userId, session) {
            sessionCache.set(userId, session);
            await db.set(`afk_session_${userId}`, session);
        },

        async deleteSession(userId) {
            sessionCache.delete(userId);
            await db.set(`afk_session_${userId}`, null);
        },

        async getUserStats(userId) {
            return await db.get(`afk_stats_${userId}`) || {
                totalAfkTime: 0,
                totalCoinsEarned: 0,
                level: 1,
                xp: 0,
                streak: 0,
                lastOnline: Date.now(),
                achievements: [],
                eventStats: {
                    rainsCollected: 0,
                    chestsOpened: 0
                }
            };
        },

        async saveUserStats(userId, stats) {
            await db.set(`afk_stats_${userId}`, stats);
        },

        async getUserCoins(userId) {
            return await db.get("coins-" + userId) || 0;
        },

        async saveUserCoins(userId, coins) {
            await db.set("coins-" + userId, Math.floor(coins));
        }
    };

    // Game mechanics helpers
    const mechanics = {
        calculateLevel(xp) {
            return 1 + Math.floor(xp / CONSTANTS.XP_PER_LEVEL);
        },

        getPartyMultiplier(activeUserCount) {
            return 1 + Math.floor(activeUserCount / CONSTANTS.PARTY_SIZE_THRESHOLD);
        },

        async checkAndUpdateStreak(stats) {
            const now = Date.now();
            const hoursSinceLastOnline = (now - stats.lastOnline) / (1000 * 60 * 60);
            
            if (hoursSinceLastOnline > CONSTANTS.STREAK_RESET_HOURS) {
                stats.streak = 1;
            } else if (new Date(stats.lastOnline).getDate() !== new Date(now).getDate()) {
                stats.streak++;
            }
            
            stats.lastOnline = now;
            return 1 + (stats.streak * CONSTANTS.STREAK_MULTIPLIER);
        },

        async calculateEarnings(session, stats, elapsedTime, activeUserCount) {
            const now = Date.now();
            
            // Calculate multipliers
            const partyMultiplier = this.getPartyMultiplier(activeUserCount);
            const streakMultiplier = await this.checkAndUpdateStreak(stats);
            const levelMultiplier = 1 + ((stats.level - 1) * CONSTANTS.LEVEL_BONUS_MULTIPLIER);
            const totalMultiplier = partyMultiplier * streakMultiplier * levelMultiplier;

            // Calculate earnings (with anti-cheat cap)
            const minutesElapsed = Math.min(elapsedTime / 60, CONSTANTS.MAX_COINS_PER_PING / CONSTANTS.BASE_COINS_PER_MINUTE);
            const baseCoinsEarned = CONSTANTS.BASE_COINS_PER_MINUTE * minutesElapsed;
            const totalCoinsEarned = baseCoinsEarned * totalMultiplier;

            // Calculate XP
            const xpEarned = CONSTANTS.BASE_XP_PER_MINUTE * minutesElapsed;

            return {
                coinsEarned: totalCoinsEarned,
                xpEarned: xpEarned,
                multipliers: {
                    party: partyMultiplier,
                    streak: streakMultiplier,
                    level: levelMultiplier
                }
            };
        },

        async checkAchievements(userId, stats, sessionData) {
            const newAchievements = [];
            let totalReward = 0;

            function checkCategory(category, value) {
                for (const achievement of ACHIEVEMENTS[category]) {
                    if (!stats.achievements.includes(achievement.id) && value >= achievement.requirement) {
                        newAchievements.push(achievement);
                        totalReward += achievement.reward;
                        stats.achievements.push(achievement.id);
                    }
                }
            }

            checkCategory('afkTime', stats.totalAfkTime);
            checkCategory('coins', stats.totalCoinsEarned);
            checkCategory('events', stats.eventStats.rainsCollected);
            checkCategory('events', stats.eventStats.chestsOpened);
            checkCategory('streaks', stats.streak);

            return { newAchievements, totalReward };
        }
    };

    // Event system
    const eventSystem = {
        scheduleNextCoinRain(userId, ws) {
            const userEvent = userEvents.get(userId);
            if (!userEvent) return;

            const nextTime = Date.now() + CONSTANTS.COIN_RAIN_INTERVAL;
            userEvent.nextCoinRain = nextTime;
            
            userEvent.coinRainTimeout = setTimeout(() => {
                this.startCoinRain(userId, ws);
            }, CONSTANTS.COIN_RAIN_INTERVAL);
        },

        startCoinRain(userId, ws) {
            const userEvent = userEvents.get(userId);
            if (!userEvent) return;

            userEvent.activeCoinRain = {
                startTime: Date.now(),
                endTime: Date.now() + CONSTANTS.COIN_RAIN_DURATION,
                coinsCollected: 0
            };

            ws.send(JSON.stringify({
                type: 'eventStart',
                eventType: 'coinRain',
                duration: CONSTANTS.COIN_RAIN_DURATION
            }));

            userEvent.coinRainEndTimeout = setTimeout(() => {
                this.endCoinRain(userId, ws);
            }, CONSTANTS.COIN_RAIN_DURATION);
        },

        endCoinRain(userId, ws) {
            const userEvent = userEvents.get(userId);
            if (!userEvent || !userEvent.activeCoinRain) return;

            ws.send(JSON.stringify({
                type: 'eventEnd',
                eventType: 'coinRain',
                coinsCollected: userEvent.activeCoinRain.coinsCollected
            }));

            userEvent.activeCoinRain = null;
            this.scheduleNextCoinRain(userId, ws);
        },

        scheduleTreasureChest(userId, ws) {
            const userEvent = userEvents.get(userId);
            if (!userEvent) return;

            const delay = CONSTANTS.TREASURE_CHEST_MIN_INTERVAL + 
                         Math.random() * (CONSTANTS.TREASURE_CHEST_MAX_INTERVAL - CONSTANTS.TREASURE_CHEST_MIN_INTERVAL);

            const nextTime = Date.now() + delay;
            userEvent.nextChest = nextTime;

            userEvent.chestTimeout = setTimeout(() => {
                this.spawnTreasureChest(userId, ws);
            }, delay);
        },

        spawnTreasureChest(userId, ws) {
            const userEvent = userEvents.get(userId);
            if (!userEvent) return;

            userEvent.activeChest = {
                startTime: Date.now(),
                endTime: Date.now() + CONSTANTS.TREASURE_CHEST_DURATION,
                reward: Math.floor(CONSTANTS.TREASURE_CHEST_MIN_REWARD + 
                        Math.random() * (CONSTANTS.TREASURE_CHEST_MAX_REWARD - CONSTANTS.TREASURE_CHEST_MIN_REWARD))
            };

            ws.send(JSON.stringify({
                type: 'eventStart',
                eventType: 'treasureChest',
                duration: CONSTANTS.TREASURE_CHEST_DURATION
            }));

            userEvent.chestEndTimeout = setTimeout(() => {
                this.expireTreasureChest(userId, ws);
            }, CONSTANTS.TREASURE_CHEST_DURATION);
        },

        expireTreasureChest(userId, ws) {
            const userEvent = userEvents.get(userId);
            if (!userEvent || !userEvent.activeChest) return;

            ws.send(JSON.stringify({
                type: 'eventEnd',
                eventType: 'treasureChest',
                expired: true
            }));

            userEvent.activeChest = null;
            this.scheduleTreasureChest(userId, ws);
        }
    };

    // WebSocket connection handler
    app.ws("/" + settings.afk.path, async (ws, req) => {
        if (!req.session.pterodactyl) {
            ws.close(1008, "Unauthorized");
            return;
        }

        const userId = req.session.userinfo.id;
        
// Initialize rate limiting
        if (!rateLimits.has(userId)) {
            rateLimits.set(userId, new RateLimit(userId));
        }
        const rateLimit = rateLimits.get(userId);

        // Add user to active users
        activeUsers.add(userId);

        // Initialize user events
        userEvents.set(userId, {
            nextCoinRain: null,
            activeCoinRain: null,
            coinRainTimeout: null,
            coinRainEndTimeout: null,
            nextChest: null,
            activeChest: null,
            chestTimeout: null,
            chestEndTimeout: null
        });

        try {
            // Initialize session with current coins
            const currentCoins = await dbHelper.getUserCoins(userId);
            let session = {
                startTime: Date.now(),
                lastUpdateTime: Date.now(),
                baseCoins: currentCoins,
                currentCoins: currentCoins,
                earnedCoins: 0
            };
            await dbHelper.saveSession(userId, session);

            // Get or initialize user stats
            let stats = await dbHelper.getUserStats(userId);

            // Start events
            eventSystem.scheduleNextCoinRain(userId, ws);
            eventSystem.scheduleTreasureChest(userId, ws);

            // Send initial state
            ws.send(JSON.stringify({
                type: 'initState',
                stats,
                activeUsers: activeUsers.size,
                nextEvents: {
                    coinRain: userEvents.get(userId).nextCoinRain,
                    chest: userEvents.get(userId).nextChest
                }
            }));

            // Handle incoming messages
            ws.on('message', async (message) => {
                try {
                    // Rate limit check
                    if (!rateLimit.canPing()) {
                        console.warn(`Rate limit exceeded for user ${userId}`);
                        return;
                    }

                    const data = JSON.parse(message);
                    const userEvent = userEvents.get(userId);
                    
                    switch (data.type) {
                        case 'ping':
                            session = await dbHelper.getSession(userId);
                            if (!session) return;

                            const now = Date.now();
                            const elapsedTime = (now - session.lastUpdateTime) / 1000;
                            
                            // Skip if too little time has passed
                            if (elapsedTime < 0.5) return;

                            // Calculate new earnings
                            const earnings = await mechanics.calculateEarnings(
                                session,
                                stats,
                                elapsedTime,
                                activeUsers.size
                            );

                            // Update session and stats
                            stats.totalAfkTime += elapsedTime;
                            stats.xp += earnings.xpEarned;
                            stats.totalCoinsEarned += earnings.coinsEarned;
                            session.earnedCoins += earnings.coinsEarned;
                            session.currentCoins = session.baseCoins + session.earnedCoins;
                            session.lastUpdateTime = now;

                            // Check for level up
                            const newLevel = mechanics.calculateLevel(stats.xp);
                            const leveledUp = newLevel > stats.level;
                            stats.level = newLevel;

                            // Check achievements
                            const achievementResults = await mechanics.checkAchievements(userId, stats, {
                                coinsEarned: earnings.coinsEarned,
                                timeElapsed: elapsedTime
                            });

                            // Add achievement rewards to coins
                            if (achievementResults.totalReward > 0) {
                                session.earnedCoins += achievementResults.totalReward;
                                session.currentCoins += achievementResults.totalReward;
                                stats.totalCoinsEarned += achievementResults.totalReward;
                            }

                            // Save updated state
                            await dbHelper.saveSession(userId, session);
                            await dbHelper.saveUserStats(userId, stats);

                            // Send update to client
                            ws.send(JSON.stringify({
                                type: 'update',
                                coins: session.currentCoins.toFixed(4),
                                stats,
                                multipliers: earnings.multipliers,
                                levelUp: leveledUp,
                                newAchievements: achievementResults.newAchievements,
                                activeUsers: activeUsers.size
                            }));
                            break;

                        case 'collectCoinRain':
                            if (!rateLimit.trackEvent()) {
                                console.warn(`Event rate limit exceeded for user ${userId}`);
                                return;
                            }

                            if (userEvent?.activeCoinRain) {
                                const coins = Math.floor(
                                    CONSTANTS.COIN_RAIN_MIN_COINS + 
                                    Math.random() * (CONSTANTS.COIN_RAIN_MAX_COINS - CONSTANTS.COIN_RAIN_MIN_COINS)
                                );
                                
                                session = await dbHelper.getSession(userId);
                                userEvent.activeCoinRain.coinsCollected += coins;
                                session.earnedCoins += coins;
                                session.currentCoins += coins;
                                stats.totalCoinsEarned += coins;
                                stats.eventStats.rainsCollected++;

                                await dbHelper.saveSession(userId, session);
                                await dbHelper.saveUserStats(userId, stats);
                                
                                ws.send(JSON.stringify({
                                    type: 'coinRainCollection',
                                    coins,
                                    total: userEvent.activeCoinRain.coinsCollected
                                }));
                            }
                            break;

                        case 'openChest':
                            if (!rateLimit.trackEvent()) return;

                            if (userEvent?.activeChest) {
                                const reward = userEvent.activeChest.reward;
                                session = await dbHelper.getSession(userId);
                                
                                session.earnedCoins += reward;
                                session.currentCoins += reward;
                                stats.totalCoinsEarned += reward;
                                stats.eventStats.chestsOpened++;

                                await dbHelper.saveSession(userId, session);
                                await dbHelper.saveUserStats(userId, stats);

                                ws.send(JSON.stringify({
                                    type: 'chestOpened',
                                    reward
                                }));

                                userEvent.activeChest = null;
                                clearTimeout(userEvent.chestEndTimeout);
                                eventSystem.scheduleTreasureChest(userId, ws);
                            }
                            break;
                    }
                } catch (error) {
                    console.error('Error handling message:', error);
                }
            });

            // Handle connection close
            ws.on('close', async () => {
                try {
                    // Clean up event timeouts
                    const userEvent = userEvents.get(userId);
                    if (userEvent) {
                        clearTimeout(userEvent.coinRainTimeout);
                        clearTimeout(userEvent.coinRainEndTimeout);
                        clearTimeout(userEvent.chestTimeout);
                        clearTimeout(userEvent.chestEndTimeout);
                        userEvents.delete(userId);
                    }

                    // Remove from active users
                    activeUsers.delete(userId);
                    rateLimits.delete(userId);

                    // Save final state
                    const session = await dbHelper.getSession(userId);
                    if (session) {
                        // Save final coins to database
                        await dbHelper.saveUserCoins(userId, Math.floor(session.currentCoins));
                        
                        // Update final stats
                        const stats = await dbHelper.getUserStats(userId);
                        const finalSessionDuration = (Date.now() - session.startTime) / 1000;
                        stats.totalAfkTime += finalSessionDuration;
                        await dbHelper.saveUserStats(userId, stats);
                        await dbHelper.deleteSession(userId);
                    }

                    // Broadcast updated party status
                    const partyMultiplier = mechanics.getPartyMultiplier(activeUsers.size);
                    app.ws.clients.forEach(client => {
                        if (client.readyState === 1) {
                            client.send(JSON.stringify({
                                type: 'partyUpdate',
                                activeUsers: activeUsers.size,
                                multiplier: partyMultiplier
                            }));
                        }
                    });
                } catch (error) {
                    console.error('Error handling close:', error);
                }
            });

        } catch (error) {
            console.error('Error in connection setup:', error);
            ws.close(1011, "Internal Server Error");
        }
    });

    // Admin API endpoints
    app.get("/admin/afk/stats", async (req, res) => {
        if (!req.session.pterodactyl?.root_admin) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        res.json({
            activeUsers: activeUsers.size,
            partyMultiplier: mechanics.getPartyMultiplier(activeUsers.size),
            totalSessions: activeUsers.size,
            constants: CONSTANTS
        });
    });

    // Periodic cleanup of stale sessions
    setInterval(async () => {
        try {
            const now = Date.now();
            for (const userId of activeUsers) {
                const session = await dbHelper.getSession(userId);
                if (session && (now - session.lastUpdateTime) > CONSTANTS.MAX_SESSION_INACTIVE_TIME) {
                    console.log(`Cleaning up stale session for user ${userId}`);
                    activeUsers.delete(userId);
                    rateLimits.delete(userId);
                    await dbHelper.deleteSession(userId);
                }
            }
        } catch (error) {
            console.error('Error in cleanup:', error);
        }
    }, CONSTANTS.MAX_SESSION_INACTIVE_TIME);
};

// Export configuration interface
module.exports.config = {
    CONSTANTS,
    ACHIEVEMENTS
};