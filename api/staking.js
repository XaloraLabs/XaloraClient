const crypto = require('crypto');

const DAILY_INTEREST_RATE = 0.05; // 5% daily
const MIN_STAKE_AMOUNT = 10; // Minimum stake
const LOCK_PERIODS = {
  '30d': { days: 30, bonus: 0.2 }, // 20% bonus
  '90d': { days: 90, bonus: 0.5 }, // 50% bonus
  '180d': { days: 180, bonus: 1.0 }, // 100% bonus
};
const EARLY_WITHDRAWAL_PENALTY = 0.5; // 50% penalty


// Staking Endpoint
app.post("/stake", async (req, res) => {
  if (!req.session.pterodactyl) return res.redirect(`/login`);

  const { amount, lockPeriod } = req.body;
  const parsedAmount = parseFloat(amount);

  // Validate inputs
  if (!LOCK_PERIODS[lockPeriod]) {
    return res.status(400).json({ error: "Invalid lock period" });
  }

  if (isNaN(parsedAmount) || parsedAmount < MIN_STAKE_AMOUNT) {
    return res.status(400).json({ error: `Invalid amount. Minimum stake is ${MIN_STAKE_AMOUNT} coins.` });
  }

  const userId = req.session.userinfo.id;
  const userCoins = await db.get(`coins-${userId}`) || 0;

  if (userCoins < parsedAmount) {
    return res.status(400).json({ error: "Insufficient balance" });
  }

  // Create new staking position
  const newPosition = {
    amount: parsedAmount,
    startTime: Date.now(),
    lockPeriod,
    lastClaimTime: Date.now(),
    positionId: crypto.randomBytes(16).toString('hex'),
  };

  const userPositions = await db.get(`staking-positions-${userId}`) || [];
  userPositions.push(newPosition);

  // Update balances
  await db.set(`staking-positions-${userId}`, userPositions);
  await db.set(`coins-${userId}`, userCoins - parsedAmount);
  await logTransaction(db, userId, "MASTER", parsedAmount, `Staked with ${lockPeriod} lock`);

  res.status(200).json({
    message: "Staked successfully",
    position: newPosition,
  });
});

const calculateEarnings = (stakedAmount, lastStakeTime, lockPeriod, dailyRate, lockPeriods) => {
  const msStaked = Date.now() - lastStakeTime;
  const daysStaked = msStaked / (24 * 60 * 60 * 1000);

  const baseRate = dailyRate / 365; // Daily rate
  const periodBonus = lockPeriods[lockPeriod]?.bonus || 0;
  const effectiveRate = baseRate * (1 + periodBonus);

  return stakedAmount * (Math.pow(1 + effectiveRate, daysStaked) - 1);
};

app.post("/unstake", async (req, res) => {
  if (!req.session.pterodactyl) return res.redirect(`/login`);

  const { positionId } = req.body;
  const userId = req.session.userinfo.id;

  // Get user's staking positions
  const positions = await db.get(`staking-positions-${userId}`) || [];
  const positionIndex = positions.findIndex(p => p.positionId === positionId);

  if (positionIndex === -1) {
    return res.status(400).json({ error: "Invalid position" });
  }

  const position = positions[positionIndex];
  const lockPeriodMs = LOCK_PERIODS[position.lockPeriod].days * 24 * 60 * 60 * 1000;
  const isLocked = Date.now() - position.startTime < lockPeriodMs;

  // Calculate earnings
  let earnings = calculateEarnings(
    position.amount,
    position.lastClaimTime,
    position.lockPeriod,
    DAILY_INTEREST_RATE,
    LOCK_PERIODS
  );

  // Apply early withdrawal penalty if applicable
  if (isLocked) {
    earnings *= (1 - EARLY_WITHDRAWAL_PENALTY);
  }

  // Update user balance
  const userCoins = await db.get(`coins-${userId}`) || 0;
  const totalReturn = position.amount + earnings;

  await db.set(`coins-${userId}`, userCoins + totalReturn);

  // Remove the position
  positions.splice(positionIndex, 1);
  await db.set(`staking-positions-${userId}`, positions);

  // Log transactions
  await logTransaction(
    db,
    "MASTER",
    userId,
    position.amount,
    `Unstaked position ${positionId}`
  );

  if (earnings > 0) {
    await logTransaction(
      db,
      "MASTER",
      userId,
      earnings,
      `Staking earnings for position ${positionId}`
    );
  }

  res.status(200).json({
    message: "Unstaked successfully",
    returned: totalReturn,
    principal: position.amount,
    earnings,
    penaltyApplied: isLocked,
  });
});

async function logTransaction(db, senderId, receiverId, amount, description) {
  const transaction = {
    senderId,
    receiverId,
    amount,
    description,
    timestamp: Date.now(),
  };

  const transactions = await db.get(`transactions`) || [];
  transactions.push(transaction);
  await db.set(`transactions`, transactions);
}

function calculateEarnings(stakedAmount, lastStakeTime, lockPeriod, dailyRate, lockPeriods) {
  const msStaked = Date.now() - lastStakeTime;
  const daysStaked = msStaked / (24 * 60 * 60 * 1000);

  const baseRate = dailyRate / 365;
  const periodBonus = lockPeriods[lockPeriod]?.bonus || 0;
  const effectiveRate = baseRate * (1 + periodBonus);

  return stakedAmount * (Math.pow(1 + effectiveRate, daysStaked) - 1);
}
