const { PrismaClient } = require('@prisma/client');
const loadConfig = require('./handlers/config');
const settings = loadConfig();

class HeliactylDB {
  constructor() {
    this.prisma = new PrismaClient();
    this.namespace = 'heliactyl';
    this.ttlSupport = false;
    this.queue = [];
    this.isProcessing = false;
    this.totalOperationTime = 0;
    this.operationCount = 0;

    // Log queue stats every 5 seconds
    if (settings.debug.database === true) { 
      this.queueStatsInterval = setInterval(() => this.logQueueStats(), 5000);
    }
  }

  async executeQuery(operation) {
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const { operation, resolve, reject } = this.queue.shift();

    const startTime = Date.now();

    try {
      const result = await operation();
      const operationTime = Date.now() - startTime;
      this.updateStats(operationTime);
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.isProcessing = false;
      this.processQueue();
    }
  }

  updateStats(operationTime) {
    this.totalOperationTime += operationTime;
    this.operationCount++;
  }

  logQueueStats() {
    const avgOperationTime =
      this.operationCount > 0
        ? this.totalOperationTime / this.operationCount
        : 0;
    console.log(
      `Queue length: ${this.queue.length}, Average DB operation time: ${avgOperationTime.toFixed(
        2
      )}ms`
    );
  }

  async get(key) {
    return this.executeQuery(async () => {
      const fullKey = `${this.namespace}:${key}`;
      const record = await this.prisma.heliactyl.findUnique({
        where: { key: fullKey },
      });

      if (record) {
        const parsed = JSON.parse(record.value);
        if (this.ttlSupport && parsed.expires) {
          if (Date.now() > parsed.expires) {
            await this.delete(key);
            return undefined;
          }
        }
        return parsed.value;
      } else {
        return undefined;
      }
    });
  }

  async set(key, value, ttl) {
    return this.executeQuery(async () => {
      const fullKey = `${this.namespace}:${key}`;
      const expires = this.ttlSupport && ttl ? Date.now() + ttl : undefined;
      const data = JSON.stringify({
        value,
        expires,
      });

      await this.prisma.heliactyl.upsert({
        where: { key: fullKey },
        update: { value: data },
        create: { key: fullKey, value: data },
      });
    });
  }

  async delete(key) {
    return this.executeQuery(async () => {
      const fullKey = `${this.namespace}:${key}`;
      await this.prisma.heliactyl.delete({
        where: { key: fullKey },
      });
    });
  }

  async clear() {
    return this.executeQuery(async () => {
      const likePattern = `${this.namespace}:%`;
      await this.prisma.heliactyl.deleteMany({
        where: {
          key: {
            startsWith: `${this.namespace}:`,
          },
        },
      });
    });
  }

  async has(key) {
    return this.executeQuery(async () => {
      const fullKey = `${this.namespace}:${key}`;
      const record = await this.prisma.heliactyl.findUnique({
        where: { key: fullKey },
      });
      return !!record;
    });
  }

  async close() {
    clearInterval(this.queueStatsInterval);
    await this.prisma.$disconnect();
  }
}

module.exports = HeliactylDB;