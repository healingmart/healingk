// =============================================================================
// 관광 API 시스템 - Part 1: 핵심 인프라
// =============================================================================

// ============= package.json =============
{
  "name": "tourism-api-system",
  "version": "1.0.0",
  "description": "한국 관광정보 API 통합 시스템",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "jest",
    "lint": "eslint src/",
    "build": "npm run lint && npm run test"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "compression": "^1.7.4",
    "express-rate-limit": "^6.8.1",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.6.1",
    "eslint": "^8.44.0"
  },
  "keywords": ["tourism", "api", "korea", "travel"],
  "author": "Your Name",
  "license": "MIT"
}

// ============= .env.example =============
# API 설정
TOURISM_API_KEY=your_tourism_api_key_here
API_TIMEOUT=15000
API_MAX_RETRIES=3
API_RETRY_DELAY=1000

# 보안 설정
ENCRYPTION_KEY=your_32_character_encryption_key_here
ALLOWED_ORIGINS=localhost,yourdomain.com
ALLOWED_IPS=
MAX_REQUESTS_PER_MINUTE=60
MAX_REQUESTS_PER_HOUR=1000
ENABLE_IP_WHITELIST=false
ENABLE_DOMAIN_WHITELIST=true

# 캐시 설정
CACHE_ENABLED=true
CACHE_MAX_SIZE=1000
CACHE_DEFAULT_TTL=3600
CACHE_COMPRESSION=true

# 로깅 설정
LOG_LEVEL=info
ENABLE_FILE_LOGGING=false
LOG_PATH=./logs
ENABLE_REQUEST_LOGGING=true

# 성능 설정
ENABLE_METRICS=true
SLOW_QUERY_THRESHOLD=5000

# 환경
NODE_ENV=development

// ============= src/config/index.js =============
const crypto = require('crypto');

class ConfigManager {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.config = this.loadConfig();
    this.validateConfig();
  }

  loadConfig() {
    const baseConfig = {
      api: {
        baseUrl: 'https://apis.data.go.kr/B551011/KorService2',
        key: process.env.TOURISM_API_KEY,
        timeout: parseInt(process.env.API_TIMEOUT) || 15000,
        maxRetries: parseInt(process.env.API_MAX_RETRIES) || 3,
        retryDelay: parseInt(process.env.API_RETRY_DELAY) || 1000
      },
      security: {
        encryptionKey: process.env.ENCRYPTION_KEY || this.generateEncryptionKey(),
        allowedOrigins: this.parseArray(process.env.ALLOWED_ORIGINS) || ['localhost'],
        allowedIPs: this.parseArray(process.env.ALLOWED_IPS) || [],
        maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 60,
        maxRequestsPerHour: parseInt(process.env.MAX_REQUESTS_PER_HOUR) || 1000,
        enableIPWhitelist: process.env.ENABLE_IP_WHITELIST === 'true',
        enableDomainWhitelist: process.env.ENABLE_DOMAIN_WHITELIST !== 'false'
      },
      cache: {
        enabled: process.env.CACHE_ENABLED !== 'false',
        maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1000,
        defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 3600,
        compressionEnabled: process.env.CACHE_COMPRESSION === 'true'
      },
      logging: {
        level: process.env.LOG_LEVEL || (this.environment === 'production' ? 'info' : 'debug'),
        enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
        logPath: process.env.LOG_PATH || './logs',
        enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false'
      },
      performance: {
        enableMetrics: process.env.ENABLE_METRICS !== 'false',
        slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD) || 5000
      }
    };

    const envConfig = this.getEnvironmentConfig();
    return this.deepMerge(baseConfig, envConfig);
  }

  getEnvironmentConfig() {
    const configs = {
      development: {
        security: {
          maxRequestsPerMinute: 200,
          enableDomainWhitelist: false
        },
        logging: {
          level: 'debug'
        }
      },
      production: {
        security: {
          maxRequestsPerMinute: 60,
          enableDomainWhitelist: true,
          enableIPWhitelist: true
        },
        cache: {
          compressionEnabled: true
        },
        logging: {
          level: 'warn',
          enableFileLogging: true
        }
      },
      test: {
        cache: {
          enabled: false
        },
        logging: {
          level: 'error'
        }
      }
    };

    return configs[this.environment] || {};
  }

  validateConfig() {
    const errors = [];

    if (!this.config.api.key) {
      errors.push('TOURISM_API_KEY 환경변수가 설정되지 않았습니다');
    }

    if (this.config.api.key && this.config.api.key.length < 20) {
      errors.push('API 키가 너무 짧습니다');
    }

    if (this.environment === 'production' && !process.env.ENCRYPTION_KEY) {
      errors.push('프로덕션 환경에서는 ENCRYPTION_KEY가 필요합니다');
    }

    if (errors.length > 0) {
      throw new Error(`설정 검증 실패:\n${errors.join('\n')}`);
    }
  }

  generateEncryptionKey() {
    if (this.environment === 'production') {
      throw new Error('프로덕션 환경에서는 ENCRYPTION_KEY를 명시적으로 설정해야 합니다');
    }
    return crypto.randomBytes(32).toString('hex');
  }

  parseArray(str) {
    if (!str) return [];
    return str.split(',').map(item => item.trim()).filter(Boolean);
  }

  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  isDevelopment() {
    return this.environment === 'development';
  }

  isProduction() {
    return this.environment === 'production';
  }

  isTest() {
    return this.environment === 'test';
  }
}

module.exports = new ConfigManager();

// ============= src/config/constants.js =============
const CONTENT_TYPES = {
  TOURIST_SPOT: '12',
  CULTURAL_FACILITY: '14',
  FESTIVAL: '15',
  TRAVEL_COURSE: '25',
  LEISURE_SPORTS: '28',
  ACCOMMODATION: '32',
  SHOPPING: '38',
  RESTAURANT: '39'
};

const CONTENT_TYPE_NAMES = {
  [CONTENT_TYPES.TOURIST_SPOT]: '관광지',
  [CONTENT_TYPES.CULTURAL_FACILITY]: '문화시설',
  [CONTENT_TYPES.FESTIVAL]: '축제/공연/행사',
  [CONTENT_TYPES.TRAVEL_COURSE]: '여행코스',
  [CONTENT_TYPES.LEISURE_SPORTS]: '레포츠',
  [CONTENT_TYPES.ACCOMMODATION]: '숙박',
  [CONTENT_TYPES.SHOPPING]: '쇼핑',
  [CONTENT_TYPES.RESTAURANT]: '음식점'
};

const API_ENDPOINTS = {
  AREA_CODE: '/areaCode2',
  CATEGORY_CODE: '/categoryCode2',
  AREA_BASED_LIST: '/areaBasedList2',
  LOCATION_BASED_LIST: '/locationBasedList2',
  SEARCH_KEYWORD: '/searchKeyword2',
  SEARCH_FESTIVAL: '/searchFestival2',
  SEARCH_STAY: '/searchStay2',
  DETAIL_COMMON: '/detailCommon2',
  DETAIL_INTRO: '/detailIntro2',
  DETAIL_INFO: '/detailInfo2',
  DETAIL_IMAGE: '/detailImage2',
  SYNC_LIST: '/areaBasedSyncList2'
};

const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  API_ERROR: 'API_ERROR',
  SECURITY_ERROR: 'SECURITY_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  CACHE_ERROR: 'CACHE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  NO_DATA_ERROR: 'NO_DATA_ERROR'
};

const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

const CACHE_KEYS = {
  SEARCH: 'search',
  DETAIL: 'detail',
  LOCATION: 'location',
  COMMON: 'common',
  INTRO: 'intro',
  IMAGES: 'images'
};

module.exports = {
  CONTENT_TYPES,
  CONTENT_TYPE_NAMES,
  API_ENDPOINTS,
  ERROR_CODES,
  HTTP_STATUS,
  CACHE_KEYS
};

// ============= src/utils/errors.js =============
const { ERROR_CODES, HTTP_STATUS } = require('../config/constants');

class BaseError extends Error {
  constructor(message, code = ERROR_CODES.API_ERROR, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp
    };
  }
}

class ValidationError extends BaseError {
  constructor(message, field = null) {
    super(message, ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST);
    this.field = field;
  }
}

class SecurityError extends BaseError {
  constructor(message, code = ERROR_CODES.SECURITY_ERROR) {
    super(message, code, HTTP_STATUS.FORBIDDEN);
  }
}

class RateLimitError extends BaseError {
  constructor(message, retryAfter = 60) {
    super(message, ERROR_CODES.RATE_LIMIT_ERROR, HTTP_STATUS.TOO_MANY_REQUESTS);
    this.retryAfter = retryAfter;
  }
}

class ApiError extends BaseError {
  constructor(message, apiCode = null, statusCode = HTTP_STATUS.BAD_REQUEST) {
    super(message, ERROR_CODES.API_ERROR, statusCode);
    this.apiCode = apiCode;
  }
}

class NetworkError extends BaseError {
  constructor(message, originalError = null) {
    super(message, ERROR_CODES.NETWORK_ERROR, HTTP_STATUS.SERVICE_UNAVAILABLE);
    this.originalError = originalError;
  }
}

class TimeoutError extends BaseError {
  constructor(message, timeout = null) {
    super(message, ERROR_CODES.TIMEOUT_ERROR, HTTP_STATUS.SERVICE_UNAVAILABLE);
    this.timeout = timeout;
  }
}

class NoDataError extends BaseError {
  constructor(message = '데이터를 찾을 수 없습니다') {
    super(message, ERROR_CODES.NO_DATA_ERROR, HTTP_STATUS.NOT_FOUND);
  }
}

class ErrorHandler {
  static handle(error, context = {}) {
    if (error instanceof BaseError) {
      return error;
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return new NetworkError('네트워크 연결 오류', error);
    }

    if (error.code === 'ETIMEDOUT' || error.name === 'TimeoutError') {
      return new TimeoutError('요청 시간 초과', error.timeout);
    }

    return new ApiError(error.message || '알 수 없는 오류가 발생했습니다');
  }

  static isRetryable(error) {
    return error instanceof NetworkError || 
           error instanceof TimeoutError || 
           (error instanceof ApiError && error.statusCode >= 500);
  }

  static getRetryDelay(attempt, baseDelay = 1000) {
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 10000);
    const jitter = Math.random() * 0.1 * delay;
    return delay + jitter;
  }
}

module.exports = {
  BaseError,
  ValidationError,
  SecurityError,
  RateLimitError,
  ApiError,
  NetworkError,
  TimeoutError,
  NoDataError,
  ErrorHandler
};

// ============= src/utils/logger.js =============
const fs = require('fs');
const path = require('path');
const config = require('../config');

class Logger {
  constructor() {
    this.logLevel = config.get('logging.level');
    this.enableFileLogging = config.get('logging.enableFileLogging');
    this.logPath = config.get('logging.logPath');
    this.enableRequestLogging = config.get('logging.enableRequestLogging');

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    if (this.enableFileLogging) {
      this.ensureLogDirectory();
    }
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message} ${metaStr}`.trim();
  }

  writeToFile(level, formattedMessage) {
    if (!this.enableFileLogging) return;

    const filename = `${level}-${new Date().toISOString().split('T')[0]}.log`;
    const filepath = path.join(this.logPath, filename);
    fs.appendFileSync(filepath, formattedMessage + '\n');
  }

  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, meta);
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[consoleMethod](formattedMessage);
    this.writeToFile(level, formattedMessage);
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  logRequest(operation, params, startTime, result = null, error = null) {
    if (!this.enableRequestLogging) return;

    const duration = Date.now() - startTime;
    const status = error ? 'ERROR' : 'SUCCESS';

    const logData = {
      operation,
      params: this.sanitizeParams(params),
      duration,
      status,
      timestamp: new Date().toISOString()
    };

    if (error) {
      logData.error = {
        message: error.message,
        code: error.code
      };
    }

    if (result) {
      logData.result = {
        itemCount: result.items?.length || 0,
        fromCache: result.fromCache || false
      };
    }

    this.info(`API Request: ${operation}`, logData);
  }

  sanitizeParams(params) {
    const sanitized = { ...params };
    if (sanitized.serviceKey) {
      sanitized.serviceKey = '***';
    }
    return sanitized;
  }

  logPerformance(operation, startTime, metadata = {}) {
    const duration = Date.now() - startTime;
    const slowQueryThreshold = config.get('performance.slowQueryThreshold');

    if (duration > slowQueryThreshold) {
      this.warn(`Slow Query Detected: ${operation}`, {
        duration,
        threshold: slowQueryThreshold,
        ...metadata
      });
    } else {
      this.debug(`Performance: ${operation}`, {
        duration,
        ...metadata
      });
    }
  }
}

module.exports = new Logger();

// ============= src/core/SecurityManager.js =============
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const { SecurityError, RateLimitError, ValidationError } = require('../utils/errors');

class SecurityManager {
  constructor() {
    this.config = config.get('security');
    this.rateLimitMap = new Map();
    this.suspiciousIPs = new Set();
    this.encryptionKey = Buffer.from(this.config.encryptionKey, 'hex');

    setInterval(() => this.cleanup(), 3600000);

    logger.info('🔐 보안 매니저 초기화 완료', {
      enableIPWhitelist: this.config.enableIPWhitelist,
      enableDomainWhitelist: this.config.enableDomainWhitelist,
      maxRequestsPerMinute: this.config.maxRequestsPerMinute
    });
  }

  async validateRequest(req, operation = 'unknown') {
    const startTime = Date.now();
    const clientIP = this.getClientIP(req);
    const userAgent = req.headers?.['user-agent'] || 'unknown';
    const referer = req.headers?.referer || req.headers?.origin || '';

    try {
      if (this.config.enableIPWhitelist && this.config.allowedIPs.length > 0) {
        if (!this.isIPAllowed(clientIP)) {
          throw new SecurityError(`IP 주소가 허용되지 않습니다: ${clientIP}`, 'IP_NOT_ALLOWED');
        }
      }

      if (this.config.enableDomainWhitelist && referer) {
        const domain = this.extractDomain(referer);
        if (!this.isDomainAllowed(domain)) {
          if (config.isProduction()) {
            throw new SecurityError(`허용되지 않은 도메인: ${domain}`, 'DOMAIN_NOT_ALLOWED');
          } else {
            logger.warn(`허용되지 않은 도메인 (개발 환경): ${domain}`);
          }
        }
      }

      if (this.suspiciousIPs.has(clientIP)) {
        throw new SecurityError('의심스러운 활동으로 인해 차단된 IP입니다', 'SUSPICIOUS_IP');
      }

      await this.checkRateLimit(clientIP, operation);
      this.validateUserAgent(userAgent);
      this.validateHeaders(req.headers);

      const sanitizedParams = this.sanitizeParams(
        req.method === 'GET' ? req.query : req.body
      );

      const validationResult = {
        valid: true,
        clientIP,
        userAgent,
        domain: this.extractDomain(referer) || 'unknown',
        sanitizedParams,
        validationTime: Date.now() - startTime
      };

      logger.debug('보안 검증 통과', {
        operation,
        clientIP,
        domain: validationResult.domain,
        validationTime: validationResult.validationTime
      });

      return validationResult;

    } catch (error) {
      logger.error('보안 검증 실패', {
        operation,
        clientIP,
        error: error.message,
        userAgent,
        referer
      });

      if (error.code === 'DOMAIN_NOT_ALLOWED' || error.code === 'IP_NOT_ALLOWED') {
        this.markSuspiciousIP(clientIP);
      }

      throw error;
    }
  }

  async checkRateLimit(clientIP, operation) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);

    const record = this.rateLimitMap.get(clientIP) || {
      minute: { time: minute, count: 0 },
      hour: { time: hour, count: 0 },
      violations: 0
    };

    if (record.minute.time === minute) {
      record.minute.count++;
    } else {
      record.minute = { time: minute, count: 1 };
    }

    if (record.hour.time === hour) {
      record.hour.count++;
    } else {
      record.hour = { time: hour, count: 1 };
    }

    this.rateLimitMap.set(clientIP, record);

    if (record.minute.count > this.config.maxRequestsPerMinute) {
      record.violations++;

      if (record.violations > 3) {
        this.markSuspiciousIP(clientIP);
      }

      throw new RateLimitError(
        `분당 요청 한도를 초과했습니다 (${record.minute.count}/${this.config.maxRequestsPerMinute})`,
        60
      );
    }

    if (record.hour.count > this.config.maxRequestsPerHour) {
      throw new RateLimitError(
        `시간당 요청 한도를 초과했습니다 (${record.hour.count}/${this.config.maxRequestsPerHour})`,
        3600
      );
    }

    return {
      remaining: {
        minute: this.config.maxRequestsPerMinute - record.minute.count,
        hour: this.config.maxRequestsPerHour - record.hour.count
      }
    };
  }

  sanitizeParams(params) {
    if (!params || typeof params !== 'object') {
      return params;
    }

    const sanitized = {};
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /data:text\/html/gi,
      /vbscript:/gi
    ];

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        let cleanValue = value.trim();

        for (const pattern of dangerousPatterns) {
          cleanValue = cleanValue.replace(pattern, '');
        }

        cleanValue = this.htmlDecode(cleanValue);
        cleanValue = this.htmlEncode(cleanValue);
        sanitized[key] = cleanValue;
      } else if (typeof value === 'number' && !isNaN(value)) {
        sanitized[key] = value;
      } else if (typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'string' ? this.sanitizeString(item) : item
        );
      } else {
        sanitized[key] = this.sanitizeParams(value);
      }
    }

    return sanitized;
  }

  sanitizeString(str) {
    return str
      .replace(/[<>&"']/g, char => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#x27;'
      }[char]))
      .trim();
  }

  htmlDecode(str) {
    return str
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'");
  }

  htmlEncode(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  validateUserAgent(userAgent) {
    const suspiciousPatterns = [
      /bot/i, /spider/i, /crawler/i, /scraper/i, /curl/i, /wget/i
    ];

    if (config.isDevelopment()) return;

    if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
      logger.warn('의심스러운 User-Agent 감지', { userAgent });
    }
  }

  validateHeaders(headers) {
    const requiredHeaders = ['user-agent'];

    for (const header of requiredHeaders) {
      if (!headers[header]) {
        throw new SecurityError(`필수 헤더가 누락되었습니다: ${header}`, 'MISSING_HEADER');
      }
    }

    const maxHeaderSize = 8192;
    const headerString = JSON.stringify(headers);

    if (headerString.length > maxHeaderSize) {
      throw new SecurityError('헤더 크기가 너무 큽니다', 'HEADER_TOO_LARGE');
    }
  }

  isIPAllowed(clientIP) {
    if (this.config.allowedIPs.length === 0) return true;

    return this.config.allowedIPs.some(allowedIP => {
      if (allowedIP.includes('/')) {
        return this.isIPInCIDR(clientIP, allowedIP);
      }
      return clientIP === allowedIP;
    });
  }

  isDomainAllowed(domain) {
    if (this.config.allowedOrigins.length === 0) return true;

    return this.config.allowedOrigins.some(allowed => {
      return domain === allowed || domain.endsWith(`.${allowed}`) || allowed === '*';
    });
  }

  isIPInCIDR(ip, cidr) {
    const [network, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    const ipInt = this.ipToInt(ip);
    const networkInt = this.ipToInt(network);
    return (ipInt & mask) === (networkInt & mask);
  }

  ipToInt(ip) {
    return ip.split('.').reduce((int, octet) => (int << 8) + parseInt(octet), 0) >>> 0;
  }

  markSuspiciousIP(clientIP) {
    this.suspiciousIPs.add(clientIP);
    logger.warn('의심스러운 IP 마킹', { clientIP });

    setTimeout(() => {
      this.suspiciousIPs.delete(clientIP);
    }, 24 * 60 * 60 * 1000);
  }

  getClientIP(req) {
    return req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers?.['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
  }

  extractDomain(url) {
    if (!url) return null;
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  cleanup() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    for (const [ip, record] of this.rateLimitMap.entries()) {
      const lastActivity = Math.max(
        record.minute.time * 60000,
        record.hour.time * 3600000
      );

      if (lastActivity < oneHourAgo) {
        this.rateLimitMap.delete(ip);
      }
    }

    logger.debug('보안 매니저 정리 작업 완료', {
      rateLimitEntries: this.rateLimitMap.size,
      suspiciousIPs: this.suspiciousIPs.size
    });
  }

  encryptApiKey(apiKey) {
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  decryptApiKey(encryptedKey) {
    const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
    let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  getSecurityStats() {
    return {
      rateLimitEntries: this.rateLimitMap.size,
      suspiciousIPs: this.suspiciousIPs.size,
      config: {
        enableIPWhitelist: this.config.enableIPWhitelist,
        enableDomainWhitelist: this.config.enableDomainWhitelist,
        maxRequestsPerMinute: this.config.maxRequestsPerMinute,
        maxRequestsPerHour: this.config.maxRequestsPerHour
      }
    };
  }
}

module.exports = SecurityManager;


// =============================================================================
// 관광 API 시스템 - Part 2: 서비스 로직 및 메인
// =============================================================================

// ============= src/core/CacheManager.js =============
const crypto = require('crypto');
const zlib = require('zlib');
const config = require('../config');
const logger = require('../utils/logger');

class CacheManager {
  constructor() {
    this.enabled = config.get('cache.enabled');
    this.maxSize = config.get('cache.maxSize');
    this.defaultTTL = config.get('cache.defaultTTL');
    this.compressionEnabled = config.get('cache.compressionEnabled');
    this.cache = new Map();
    this.stats = {
      hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0, compressionSaves: 0
    };
    this.memoryUsage = 0;
    this.maxMemoryMB = 100;

    setInterval(() => this.cleanup(), 600000);
    logger.info('💾 캐시 매니저 초기화 완료', {
      enabled: this.enabled,
      maxSize: this.maxSize,
      compressionEnabled: this.compressionEnabled
    });
  }

  get(key) {
    if (!this.enabled) return null;

    const item = this.cache.get(key);
    if (!item) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > item.expires) {
      this.cache.delete(key);
      this.updateMemoryUsage(-item.size);
      this.stats.misses++;
      this.stats.deletes++;
      return null;
    }

    item.lastAccessed = Date.now();
    item.accessCount++;
    this.stats.hits++;

    let data = item.data;
    if (item.compressed) {
      try {
        data = JSON.parse(zlib.gunzipSync(data).toString());
      } catch (error) {
        logger.error('캐시 압축 해제 실패', { key, error: error.message });
        this.cache.delete(key);
        return null;
      }
    }

    logger.debug('캐시 히트', { key, accessCount: item.accessCount });
    return data;
  }

  set(key, data, ttlSeconds = null) {
    if (!this.enabled) return false;

    const ttl = ttlSeconds ? ttlSeconds * 1000 : this.defaultTTL * 1000;
    const expires = Date.now() + ttl;
    const now = Date.now();

    let processedData = data;
    let compressed = false;
    let originalSize = this.calculateSize(data);
    let finalSize = originalSize;

    if (this.compressionEnabled && originalSize > 1024) {
      try {
        const jsonString = JSON.stringify(data);
        const compressedData = zlib.gzipSync(jsonString);

        if (compressedData.length < originalSize * 0.8) {
          processedData = compressedData;
          compressed = true;
          finalSize = compressedData.length;
          this.stats.compressionSaves += originalSize - finalSize;
        }
      } catch (error) {
        logger.error('캐시 압축 실패', { key, error: error.message });
      }
    }

    const item = {
      data: processedData,
      expires,
      created: now,
      lastAccessed: now,
      accessCount: 0,
      size: finalSize,
      originalSize,
      compressed,
      ttl: ttl / 1000
    };

    if (this.memoryUsage + finalSize > this.maxMemoryMB * 1024 * 1024) {
      this.evictLRU();
    }

    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, item);
    this.updateMemoryUsage(finalSize);
    this.stats.sets++;

    logger.debug('캐시 저장', {
      key,
      originalSize,
      finalSize,
      compressed,
      compressionRatio: compressed ? (finalSize / originalSize).toFixed(2) : 1,
      ttl: ttl / 1000
    });

    return true;
  }

  generateKey(prefix, params, options = {}) {
    const normalizedParams = this.normalizeParams(params);
    const keyData = { prefix, params: normalizedParams, ...options };
    const keyString = JSON.stringify(keyData, Object.keys(keyData).sort());
    const hash = crypto.createHash('md5').update(keyString).digest('hex').substring(0, 16);
    return `${prefix}:${hash}`;
  }

  normalizeParams(params) {
    if (!params || typeof params !== 'object') return params;

    const normalized = {};
    const sortedKeys = Object.keys(params).sort();

    for (const key of sortedKeys) {
      const value = params[key];
      if (value !== null && value !== undefined && value !== '') {
        normalized[key] = typeof value === 'string' ? value.trim() : value;
      }
    }

    return normalized;
  }

  evictLRU() {
    if (this.cache.size === 0) return;

    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const item = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      this.updateMemoryUsage(-item.size);
      this.stats.evictions++;

      logger.debug('LRU 캐시 제거', {
        key: oldestKey,
        lastAccessed: new Date(oldestTime).toISOString(),
        size: item.size
      });
    }
  }

  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;
    let reclaimedMemory = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        reclaimedMemory += item.size;
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    this.updateMemoryUsage(-reclaimedMemory);
    this.stats.deletes += cleanedCount;

    if (cleanedCount > 0) {
      logger.debug('캐시 정리 완료', {
        cleanedCount,
        reclaimedMemory,
        totalEntries: this.cache.size
      });
    }
  }

  calculateSize(data) {
    if (typeof data === 'string') {
      return Buffer.byteLength(data, 'utf8');
    }

    try {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch {
      return 1024;
    }
  }

  updateMemoryUsage(delta) {
    this.memoryUsage = Math.max(0, this.memoryUsage + delta);
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;
    const memoryUsageMB = (this.memoryUsage / 1024 / 1024).toFixed(2);
    const compressionSavesMB = (this.stats.compressionSaves / 1024 / 1024).toFixed(2);

    return {
      enabled: this.enabled,
      size: this.cache.size,
      maxSize: this.maxSize,
      memoryUsageMB: parseFloat(memoryUsageMB),
      maxMemoryMB: this.maxMemoryMB,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      evictions: this.stats.evictions,
      compressionEnabled: this.compressionEnabled,
      compressionSavesMB: parseFloat(compressionSavesMB)
    };
  }
}

module.exports = CacheManager;

// ============= src/core/ApiClient.js =============
const config = require('../config');
const logger = require('../utils/logger');
const { ErrorHandler, ApiError, NetworkError, TimeoutError } = require('../utils/errors');

class ApiClient {
  constructor() {
    this.baseUrl = config.get('api.baseUrl');
    this.timeout = config.get('api.timeout');
    this.maxRetries = config.get('api.maxRetries');
    this.retryDelay = config.get('api.retryDelay');
    this.requestId = 0;
    this.activeRequests = new Map();

    logger.info('🌐 API 클라이언트 초기화 완료', {
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      maxRetries: this.maxRetries
    });
  }

  async request(endpoint, params = {}, options = {}) {
    const requestId = ++this.requestId;
    const startTime = Date.now();

    const requestOptions = {
      timeout: options.timeout || this.timeout,
      maxRetries: options.maxRetries || this.maxRetries,
      retryDelay: options.retryDelay || this.retryDelay,
      validateResponse: options.validateResponse !== false,
      ...options
    };

    const url = this.buildUrl(endpoint, params);
    const maskedUrl = this.maskSensitiveInfo(url);

    logger.debug('API 요청 시작', {
      requestId,
      endpoint,
      url: maskedUrl,
      timeout: requestOptions.timeout
    });

    try {
      this.activeRequests.set(requestId, {
        url: maskedUrl,
        startTime,
        endpoint
      });

      const response = await this.fetchWithRetry(url, requestOptions, requestId);
      const data = await this.parseResponse(response, endpoint);

      if (requestOptions.validateResponse) {
        this.validateApiResponse(data, endpoint);
      }

      const duration = Date.now() - startTime;

      logger.info('API 요청 성공', {
        requestId,
        endpoint,
        duration,
        status: response.status
      });

      return data;

    } catch (error) {
      const duration = Date.now() - startTime;
      const handledError = ErrorHandler.handle(error);

      logger.error('API 요청 실패', {
        requestId,
        endpoint,
        duration,
        error: handledError.message,
        code: handledError.code
      });

      throw handledError;

    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  async fetchWithRetry(url, options, requestId) {
    let lastError;

    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
      try {
        logger.debug('API 호출 시도', {
          requestId,
          attempt,
          maxRetries: options.maxRetries,
          url: this.maskSensitiveInfo(url)
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, options.timeout);

        const fetchOptions = {
          method: 'GET',
          headers: {
            'User-Agent': 'TourismJS/1.0.0 (Tourism Information Service)',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            ...options.headers
          },
          signal: controller.signal,
          timeout: options.timeout
        };

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new ApiError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            response.status
          );
        }

        logger.debug('API 호출 성공', {
          requestId,
          attempt,
          status: response.status,
          contentType: response.headers.get('content-type')
        });

        return response;

      } catch (error) {
        clearTimeout?.(timeoutId);
        lastError = error;

        if (!ErrorHandler.isRetryable(error) || attempt === options.maxRetries) {
          throw error;
        }

        const delay = ErrorHandler.getRetryDelay(attempt, options.retryDelay);

        logger.warn('API 호출 실패, 재시도', {
          requestId,
          attempt,
          maxRetries: options.maxRetries,
          error: error.message,
          retryDelay: delay
        });

        await this.delay(delay);
      }
    }

    throw lastError;
  }

  async parseResponse(response, endpoint) {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch (error) {
        throw new ApiError(`JSON 파싱 실패: ${error.message}`, 'JSON_PARSE_ERROR');
      }
    } else if (contentType.includes('text/')) {
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new ApiError(`응답 형식이 올바르지 않습니다: ${contentType}`, 'INVALID_CONTENT_TYPE');
      }
    } else {
      throw new ApiError(`지원하지 않는 응답 형식: ${contentType}`, 'UNSUPPORTED_CONTENT_TYPE');
    }
  }

  validateApiResponse(data, operation) {
    if (!data) {
      throw new ApiError(`${operation} API 응답이 비어있습니다`, 'EMPTY_RESPONSE');
    }

    const resultCode = data.resultCode || data.response?.header?.resultCode;
    const resultMsg = data.resultMsg || data.response?.header?.resultMsg;

    if (resultCode && resultCode !== '0' && resultCode !== '0000') {
      const errorMessage = resultMsg || '알 수 없는 API 오류';
      throw new ApiError(`${operation} API 오류: ${errorMessage}`, resultCode);
    }

    if (data.response && !data.response.body) {
      throw new ApiError(`${operation} API 응답에 본문 데이터가 없습니다`, 'NO_BODY_DATA');
    }

    return true;
  }

  extractItems(data) {
    const possiblePaths = [
      data.response?.body?.items?.item,
      data.items?.item,
      data.response?.body?.item,
      data.item,
      data.data
    ];

    for (const items of possiblePaths) {
      if (items) {
        return Array.isArray(items) ? items : [items];
      }
    }

    return [];
  }

  extractSingleItem(data) {
    const items = this.extractItems(data);
    if (items.length === 0) {
      throw new ApiError('데이터를 찾을 수 없습니다', 'NO_DATA_FOUND');
    }
    return items[0];
  }

  buildUrl(endpoint, params) {
    const url = new URL(endpoint, this.baseUrl);

    const defaultParams = {
      MobileOS: 'ETC',
      MobileApp: 'TourismJS',
      _type: 'json'
    };

    const allParams = { ...defaultParams, ...params };

    for (const [key, value] of Object.entries(allParams)) {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  maskSensitiveInfo(url) {
    return url.replace(/serviceKey=[^&]+/, 'serviceKey=***');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getActiveRequestsStats() {
    return {
      count: this.activeRequests.size,
      requests: Array.from(this.activeRequests.entries()).map(([id, req]) => ({
        id,
        endpoint: req.endpoint,
        duration: Date.now() - req.startTime,
        url: req.url
      }))
    };
  }

  cancelAllRequests() {
    const cancelledCount = this.activeRequests.size;
    this.activeRequests.clear();
    logger.info('모든 활성 요청 취소', { cancelledCount });
    return cancelledCount;
  }
}

module.exports = ApiClient;

// ============= src/engines/SearchEngine.js =============
const ApiClient = require('../core/ApiClient');
const CacheManager = require('../core/CacheManager');
const logger = require('../utils/logger');
const { ValidationError } = require('../utils/errors');
const { CONTENT_TYPES, CONTENT_TYPE_NAMES, API_ENDPOINTS, CACHE_KEYS } = require('../config/constants');

class SearchEngine {
  constructor() {
    this.apiClient = new ApiClient();
    this.cache = new CacheManager();
    this.searchStats = {
      totalSearches: 0,
      keywordSearches: 0,
      locationSearches: 0,
      areaSearches: 0,
      cacheHits: 0
    };

    logger.info('🔍 검색 엔진 초기화 완료');
  }

  async executeSearch(apiKey, searchParams) {
    const { type = 'keyword', ...params } = searchParams;
    this.searchStats.totalSearches++;

    try {
      let result;

      switch (type) {
        case 'keyword':
          result = await this.executeKeywordSearch(apiKey, params);
          this.searchStats.keywordSearches++;
          break;

        case 'location':
          result = await this.executeLocationSearch(apiKey, params);
          this.searchStats.locationSearches++;
          break;

        case 'area':
          result = await this.executeAreaBasedSearch(apiKey, params);
          this.searchStats.areaSearches++;
          break;

        case 'festival':
          result = await this.executeFestivalSearch(apiKey, params);
          break;

        case 'accommodation':
          result = await this.executeAccommodationSearch(apiKey, params);
          break;

        default:
          throw new ValidationError(`지원하지 않는 검색 타입: ${type}`);
      }

      if (result.fromCache) {
        this.searchStats.cacheHits++;
      }

      return result;

    } catch (error) {
      logger.error('검색 실행 실패', {
        type,
        params: this.sanitizeParams(params),
        error: error.message
      });
      throw error;
    }
  }

  async executeKeywordSearch(apiKey, params) {
    const {
      query,
      numOfRows = 10,
      pageNo = 1,
      areaCode,
      contentTypeId,
      arrange = 'C'
    } = params;

    if (!query || query.trim().length === 0) {
      throw new ValidationError('검색 키워드는 필수입니다', 'query');
    }

    if (query.length > 100) {
      throw new ValidationError('검색 키워드가 너무 깁니다 (최대 100자)', 'query');
    }

    const cacheKey = this.cache.generateKey(CACHE_KEYS.SEARCH, {
      type: 'keyword',
      query: query.trim(),
      numOfRows,
      pageNo,
      areaCode,
      contentTypeId,
      arrange
    });

    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('키워드 검색 캐시 히트', { query, cacheKey });
      return { ...cached, fromCache: true };
    }

    const searchParams = {
      serviceKey: apiKey,
      keyword: query.trim(),
      numOfRows: Math.min(numOfRows, 100),
      pageNo: Math.max(pageNo, 1),
      arrange
    };

    if (areaCode) searchParams.areaCode = areaCode;
    if (contentTypeId) searchParams.contentTypeId = contentTypeId;

    const startTime = Date.now();
    const data = await this.apiClient.request(API_ENDPOINTS.SEARCH_KEYWORD, searchParams);

    const items = this.apiClient.extractItems(data);
    const processedItems = this.processSearchItems(items);

    const result = {
      items: processedItems,
      pagination: this.extractPagination(data),
      searchInfo: {
        query: query.trim(),
        type: 'keyword',
        totalCount: this.extractTotalCount(data),
        searchTime: Date.now() - startTime,
        filters: {
          areaCode: areaCode || null,
          contentTypeId: contentTypeId || null,
          contentTypeName: contentTypeId ? CONTENT_TYPE_NAMES[contentTypeId] : null
        }
      }
    };

    if (processedItems.length > 0) {
      this.cache.set(cacheKey, result, 1800);
    }

    logger.info('키워드 검색 완료', {
      query,
      resultCount: processedItems.length,
      searchTime: result.searchInfo.searchTime
    });

    return result;
  }

  async executeLocationSearch(apiKey, params) {
    const {
      lat,
      lng,
      radius = 1000,
      numOfRows = 10,
      pageNo = 1,
      contentTypeId,
      arrange = 'E'
    } = params;

    if (!lat || !lng) {
      throw new ValidationError('위도와 경도는 필수입니다');
    }

    if (isNaN(lat) || isNaN(lng)) {
      throw new ValidationError('올바른 좌표를 입력해주세요');
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (latitude < 33 || latitude > 43 || longitude < 124 || longitude > 132) {
      throw new ValidationError('한국 영역을 벗어난 좌표입니다');
    }

    if (radius < 100 || radius > 20000) {
      throw new ValidationError('검색 반경은 100m ~ 20km 사이여야 합니다', 'radius');
    }

    const cacheKey = this.cache.generateKey(CACHE_KEYS.LOCATION, {
      lat: latitude,
      lng: longitude,
      radius,
      numOfRows,
      pageNo,
      contentTypeId,
      arrange
    });

    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('위치 검색 캐시 히트', { lat: latitude, lng: longitude, radius });
      return { ...cached, fromCache: true };
    }

    const searchParams = {
      serviceKey: apiKey,
      mapX: longitude,
      mapY: latitude,
      radius: Math.min(radius, 20000),
      numOfRows: Math.min(numOfRows, 100),
      pageNo: Math.max(pageNo, 1),
      arrange
    };

    if (contentTypeId) searchParams.contentTypeId = contentTypeId;

    const startTime = Date.now();
    const data = await this.apiClient.request(API_ENDPOINTS.LOCATION_BASED_LIST, searchParams);

    const items = this.apiClient.extractItems(data);
    const processedItems = this.processLocationItems(items, latitude, longitude);

    const result = {
      items: processedItems,
      pagination: this.extractPagination(data),
      searchInfo: {
        type: 'location',
        searchCenter: {
          lat: latitude,
          lng: longitude
        },
        radius,
        totalCount: this.extractTotalCount(data),
        searchTime: Date.now() - startTime,
        filters: {
          contentTypeId: contentTypeId || null,
          contentTypeName: contentTypeId ? CONTENT_TYPE_NAMES[contentTypeId] : null
        }
      }
    };

    if (processedItems.length > 0) {
      this.cache.set(cacheKey, result, 1800);
    }

    logger.info('위치 검색 완료', {
      center: { lat: latitude, lng: longitude },
      radius,
      resultCount: processedItems.length,
      searchTime: result.searchInfo.searchTime
    });

    return result;
  }

  processSearchItems(items) {
    if (!Array.isArray(items)) return [];

    return items.map(item => ({
      contentId: item.contentid,
      contentTypeId: item.contenttypeid,
      title: this.cleanText(item.title),
      address: {
        main: item.addr1 || null,
        detail: item.addr2 || null,
        full: this.buildFullAddress(item.addr1, item.addr2)
      },
      location: this.extractLocation(item),
      images: this.extractImages(item),
      contact: {
        tel: item.tel || null
      },
      classification: this.extractClassification(item),
      metadata: {
        contentTypeName: CONTENT_TYPE_NAMES[item.contenttypeid] || '기타',
        modifiedTime: item.modifiedtime || null,
        createdTime: item.createdtime || null,
        readCount: parseInt(item.readcount) || 0
      },
      overview: this.cleanText(item.overview, 200)
    }));
  }

  processLocationItems(items, searchLat, searchLng) {
    const processedItems = this.processSearchItems(items);

    return processedItems.map(item => {
      const distance = item.location.coordinates ?
        this.calculateDistance(
          searchLat,
          searchLng,
          item.location.coordinates.lat,
          item.location.coordinates.lng
        ) : null;

      return {
        ...item,
        distance: distance ? Math.round(distance) : null
      };
    }).sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
  }

  extractLocation(item) {
    const mapx = parseFloat(item.mapx);
    const mapy = parseFloat(item.mapy);

    return {
      coordinates: (mapx && mapy && !isNaN(mapx) && !isNaN(mapy)) ? {
        lng: mapx,
        lat: mapy
      } : null,
      areaCode: item.areacode || null,
      sigunguCode: item.sigungucode || null
    };
  }

  extractImages(item) {
    const images = {
      primary: item.firstimage || null,
      thumbnail: item.firstimage2 || null
    };

    if (images.primary && !this.isValidImageUrl(images.primary)) {
      images.primary = null;
    }
    if (images.thumbnail && !this.isValidImageUrl(images.thumbnail)) {
      images.thumbnail = null;
    }

    return images;
  }

  extractClassification(item) {
    return {
      category: {
        large: item.cat1 || null,
        medium: item.cat2 || null,
        small: item.cat3 || null
      }
    };
  }

  extractPagination(data) {
    const body = data.response?.body || {};

    return {
      currentPage: parseInt(body.pageNo) || 1,
      itemsPerPage: parseInt(body.numOfRows) || 10,
      totalItems: parseInt(body.totalCount) || 0,
      totalPages: Math.ceil((parseInt(body.totalCount) || 0) / (parseInt(body.numOfRows) || 10))
    };
  }

  extractTotalCount(data) {
    return parseInt(data.response?.body?.totalCount) || 0;
  }

  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  isValidImageUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  cleanText(text, maxLength = null) {
    if (!text) return null;

    let cleaned = text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    if (maxLength && cleaned.length > maxLength) {
      cleaned = cleaned.slice(0, maxLength) + '...';
    }

    return cleaned || null;
  }

  buildFullAddress(addr1, addr2) {
    if (!addr1) return null;
    return addr2 ? `${addr1} ${addr2}` : addr1;
  }

  sanitizeParams(params) {
    const sanitized = { ...params };
    if (sanitized.serviceKey) {
      sanitized.serviceKey = '***';
    }
    return sanitized;
  }

  getSearchStats() {
    return {
      ...this.searchStats,
      cacheStats: this.cache.getStats()
    };
  }
}

module.exports = SearchEngine;

// ============= src/services/TourismService.js =============
const config = require('../config');
const SecurityManager = require('../core/SecurityManager');
const SearchEngine = require('../engines/SearchEngine');
const logger = require('../utils/logger');
const { ValidationError } = require('../utils/errors');

class TourismService {
  constructor() {
    this.security = new SecurityManager();
    this.searchEngine = new SearchEngine();
    
    this.serviceStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      operationCounts: {},
      startTime: Date.now()
    };

    logger.info('🎯 관광 서비스 초기화 완료');
  }

  async processRequest(req, operation, params = {}) {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    logger.info('서비스 요청 시작', {
      requestId,
      operation,
      clientIP: this.security.getClientIP(req)
    });

    this.serviceStats.totalRequests++;
    this.serviceStats.operationCounts[operation] = 
      (this.serviceStats.operationCounts[operation] || 0) + 1;

    try {
      const securityResult = await this.security.validateRequest(req, operation);
      const sanitizedParams = securityResult.sanitizedParams || params;

      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new ValidationError('API 키가 설정되지 않았습니다');
      }

      let result;
      switch (operation) {
        case 'search':
        case 'masterSearch':
          result = await this.handleSearch(apiKey, sanitizedParams, requestId);
          break;

        case 'locationSearch':
          result = await this.handleLocationSearch(apiKey, sanitizedParams, requestId);
          break;

        default:
          throw new ValidationError(`지원하지 않는 오퍼레이션: ${operation}`);
      }

      const responseTime = Date.now() - startTime;
      this.updateResponseTimeStats(responseTime);
      this.serviceStats.successfulRequests++;

      const response = this.buildSuccessResponse(operation, result, {
        requestId,
        responseTime,
        security: {
          clientIP: securityResult.clientIP,
          domain: securityResult.domain,
          validationTime: securityResult.validationTime
        }
      });

      logger.info('서비스 요청 완료', {
        requestId,
        operation,
        responseTime,
        success: true,
        itemCount: result.items?.length || 0
      });

      return response;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.serviceStats.failedRequests++;

      logger.error('서비스 요청 실패', {
        requestId,
        operation,
        responseTime,
        error: error.message,
        code: error.code
      });

      return this.buildErrorResponse(operation, error, {
        requestId,
        responseTime
      });
    }
  }

  async handleSearch(apiKey, params, requestId) {
    const { query, type = 'keyword', ...searchParams } = params;

    if (!query) {
      throw new ValidationError('검색 키워드는 필수입니다', 'query');
    }

    logger.debug('검색 요청 처리', { requestId, query, type });

    const result = await this.searchEngine.executeSearch(apiKey, {
      type,
      query,
      ...searchParams
    });

    return {
      ...result,
      searchMetadata: {
        query,
        type,
        suggestedRelated: this.generateRelatedQueries(query)
      }
    };
  }

  async handleLocationSearch(apiKey, params, requestId) {
    const { lat, lng, radius, ...searchParams } = params;

    logger.debug('위치 검색 요청 처리', { requestId, lat, lng, radius });

    const result = await this.searchEngine.executeSearch(apiKey, {
      type: 'location',
      lat,
      lng,
      radius,
      ...searchParams
    });

    return {
      ...result,
      locationMetadata: {
        searchCenter: {
          lat: parseFloat(lat),
          lng: parseFloat(lng)
        },
        radius: parseInt(radius) || 1000,
        nearbyRecommendations: this.generateNearbyRecommendations(result.items)
      }
    };
  }

  buildSuccessResponse(operation, data, metadata = {}) {
    return {
      success: true,
      operation,
      data,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        performance: {
          responseTime: metadata.responseTime,
          cached: data.fromCache || false
        },
        serviceStats: this.getPublicStats()
      }
    };
  }

  buildErrorResponse(operation, error, metadata = {}) {
    return {
      success: false,
      operation,
      error: {
        message: error.message,
        code: error.code || 'UNKNOWN_ERROR',
        statusCode: error.statusCode || 500
      },
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    };
  }

  getApiKey() {
    return config.get('api.key');
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  updateResponseTimeStats(responseTime) {
    const currentAvg = this.serviceStats.averageResponseTime;
    const totalRequests = this.serviceStats.totalRequests;
    
    this.serviceStats.averageResponseTime = 
      (currentAvg * (totalRequests - 1) + responseTime) / totalRequests;
  }

  generateRelatedQueries(query) {
    const relatedMap = {
      '경복궁': ['창덕궁', '덕수궁', '창경궁', '서울 궁궐'],
      '제주도': ['한라산', '성산일출봉', '제주 해변', '제주 카페'],
      '부산': ['해운대', '광안리', '감천문화마을', '태종대'],
      '강릉': ['경포대', '안목해변', '강릉 커피', '오죽헌']
    };

    return relatedMap[query] || [];
  }

  generateNearbyRecommendations(items) {
    if (!items || items.length === 0) return [];

    return items.slice(0, 3).map(item => ({
      contentId: item.contentId,
      title: item.title,
      distance: item.distance,
      type: item.metadata?.contentTypeName
    }));
  }

  getPublicStats() {
    const uptime = Date.now() - this.serviceStats.startTime;
    
    return {
      totalRequests: this.serviceStats.totalRequests,
      successRate: this.serviceStats.totalRequests > 0 ? 
        ((this.serviceStats.successfulRequests / this.serviceStats.totalRequests) * 100).toFixed(2) + '%' : '0%',
      averageResponseTime: Math.round(this.serviceStats.averageResponseTime),
      uptime: Math.floor(uptime / 1000),
      version: '1.0.0'
    };
  }

  getDetailedStats() {
    return {
      ...this.serviceStats,
      security: this.security.getSecurityStats(),
      search: this.searchEngine.getSearchStats(),
      uptime: Date.now() - this.serviceStats.startTime
    };
  }
}

module.exports = TourismService;

// ============= src/index.js (메인 파일) =============
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const TourismService = require('./services/TourismService');
const logger = require('./utils/logger');
const { ValidationError, SecurityError, RateLimitError } = require('./utils/errors');

class TourismApiServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.tourismService = new TourismService();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    
    logger.info('🚀 관광 API 서버 초기화 완료');
  }

  setupMiddleware() {
    // 보안 헤더
    this.app.use(helmet({
      contentSecurityPolicy: false, // API 서버이므로 비활성화
      crossOriginEmbedderPolicy: false
    }));

    // 압축
    this.app.use(compression());

    // CORS 설정
    const corsOptions = {
      origin: (origin, callback) => {
        const allowedOrigins = config.get('security.allowedOrigins');
        
        if (!origin || allowedOrigins.includes('*') || 
            allowedOrigins.some(allowed => 
              origin === `http://${allowed}` || 
              origin === `https://${allowed}` ||
              origin.endsWith(`.${allowed}`)
            )) {
          callback(null, true);
        } else {
          callback(new Error('CORS 정책에 의해 차단되었습니다'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    };

    this.app.use(cors(corsOptions));

    // Rate Limiting
    const limiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1분
      max: config.get('security.maxRequestsPerMinute'),
      message: {
        error: 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
        retryAfter: 60
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // 개발 환경에서는 rate limit 완화
        return config.isDevelopment() && req.ip === '127.0.0.1';
      }
    });

    this.app.use('/api/', limiter);

    // JSON 파싱
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 요청 로깅
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info('HTTP Request', {
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          duration,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      });
      
      next();
    });
  }

  setupRoutes() {
    // 헬스 체크
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      });
    });

    // 서비스 통계
    this.app.get('/api/stats', async (req, res) => {
      try {
        const stats = this.tourismService.getDetailedStats();
        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 통합 검색 API
    this.app.get('/api/search', async (req, res) => {
      try {
        const result = await this.tourismService.processRequest(req, 'search', req.query);
        res.status(result.success ? 200 : (result.error?.statusCode || 500)).json(result);
      } catch (error) {
        this.handleApiError(res, error);
      }
    });

    // 위치 기반 검색 API
    this.app.get('/api/location', async (req, res) => {
      try {
        const result = await this.tourismService.processRequest(req, 'locationSearch', req.query);
        res.status(result.success ? 200 : (result.error?.statusCode || 500)).json(result);
      } catch (error) {
        this.handleApiError(res, error);
      }
    });

    // API 문서
    this.app.get('/api/docs', (req, res) => {
      res.json({
        title: '관광정보 API 시스템',
        version: '1.0.0',
        description: '한국 관광정보를 제공하는 통합 API 시스템',
        endpoints: {
          'GET /api/search': {
            description: '키워드 기반 관광정보 검색',
            parameters: {
              query: { type: 'string', required: true, description: '검색 키워드' },
              numOfRows: { type: 'number', default: 10, description: '페이지당 결과 수 (최대 100)' },
              pageNo: { type: 'number', default: 1, description: '페이지 번호' },
              areaCode: { type: 'string', description: '지역 코드' },
              contentTypeId: { type: 'string', description: '콘텐츠 타입 ID' }
            }
          },
          'GET /api/location': {
            description: '위치 기반 관광정보 검색',
            parameters: {
              lat: { type: 'number', required: true, description: '위도' },
              lng: { type: 'number', required: true, description: '경도' },
              radius: { type: 'number', default: 1000, description: '검색 반경 (미터)' },
              numOfRows: { type: 'number', default: 10, description: '페이지당 결과 수' },
              pageNo: { type: 'number', default: 1, description: '페이지 번호' }
            }
          }
        },
        contentTypes: {
          '12': '관광지',
          '14': '문화시설',
          '15': '축제/공연/행사',
          '25': '여행코스',
          '28': '레포츠',
          '32': '숙박',
          '38': '쇼핑',
          '39': '음식점'
        }
      });
    });

    // 404 핸들러
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          message: '요청한 경로를 찾을 수 없습니다',
          code: 'NOT_FOUND',
          statusCode: 404
        },
        availableEndpoints: [
          'GET /health',
          'GET /api/docs',
          'GET /api/stats',
          'GET /api/search',
          'GET /api/location'
        ]
      });
    });
  }

  setupErrorHandling() {
    this.app.use((error, req, res, next) => {
      logger.error('Express 에러 핸들러', {
        error: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method
      });

      this.handleApiError(res, error);
    });
  }

  handleApiError(res, error) {
    let statusCode = 500;
    let code = 'INTERNAL_SERVER_ERROR';

    if (error instanceof ValidationError) {
      statusCode = 400;
      code = 'VALIDATION_ERROR';
    } else if (error instanceof SecurityError) {
      statusCode = 403;
      code = 'SECURITY_ERROR';
    } else if (error instanceof RateLimitError) {
      statusCode = 429;
      code = 'RATE_LIMIT_ERROR';
    }

    res.status(statusCode).json({
      success: false,
      error: {
        message: error.message || '서버 내부 오류가 발생했습니다',
        code: error.code || code,
        statusCode
      },
      timestamp: new Date().toISOString()
    });
  }

  start() {
    this.app.listen(this.port, () => {
      logger.info(`🌟 관광 API 서버가 포트 ${this.port}에서 시작되었습니다`, {
        port: this.port,
        environment: config.get('environment'),
        nodeEnv: process.env.NODE_ENV
      });

      logger.info('📋 사용 가능한 엔드포인트:', {
        health: `http://localhost:${this.port}/health`,
        docs: `http://localhost:${this.port}/api/docs`,
        search: `http://localhost:${this.port}/api/search?query=경복궁`,
        location: `http://localhost:${this.port}/api/location?lat=37.5665&lng=126.9780&radius=1000`
      });
    });
  }
}

// 서버 시작
if (require.main === module) {
  try {
    const server = new TourismApiServer();
    server.start();
  } catch (error) {
    logger.error('서버 시작 실패', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

module.exports = TourismApiServer;

// ============= README.md =============
# 관광 API 시스템 v1.0.0

## 📋 개요
한국 관광정보를 제공하는 통합 API 시스템입니다. 관광공사 API를 기반으로 안전하고 효율적인 관광정보 검색 서비스를 제공합니다.

## ✨ 주요 기능
- 🔍 키워드 기반 관광정보 검색
- 📍 위치 기반 주변 관광지 검색  
- 🔒 강화된 보안 시스템 (Rate Limiting, IP 화이트리스트)
- ⚡ 지능형 캐싱 시스템 (압축, LRU)
- 📊 실시간 모니터링 및 통계
- 🛡️ 입력 데이터 검증 및 정화

## 🚀 빠른 시작

### 1. 설치
```bash
npm install
