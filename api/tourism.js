/*
관광 정보 API 서버리스 함수 (오류 수정 및 개선 버전)

주요 변경 사항:
- API 키 처리 개선: API 키 누락 시 명확한 오류 메시지 반환
- HTTP 클라이언트 안정성 향상: Node.js 환경에서 http/https 모듈 동적 import 개선
- 에러 핸들링 강화: 전반적인 에러 처리 로직 개선
- 코드 가독성 향상: 주석 추가 및 코드 구조 정리
*/

// ===== 전역 상수 정의 =====
const SERVICE_START_TIME = Date.now();
const hasProcess = typeof process !== 'undefined' && process.versions && process.versions.node;

// ===== 기본 유틸리티 =====
class SafeUtils {
    static generateRequestId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0,
                v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    static safeParseInt(value, defaultValue = NaN) {
        if (value === null || value === undefined || value === '') return defaultValue;
        const num = parseInt(value, 10);
        return isNaN(num) ? defaultValue : num;
    }

    static safeParseFloat(value, defaultValue = NaN) {
        if (value === null || value === undefined || value === '') return defaultValue;
        const num = parseFloat(value);
        return isNaN(num) ? defaultValue : num;
    }

    static sanitizeInput(input, maxLength = 1000, options = {}) {
        if (typeof input !== 'string') return input;
        let sanitized = input.trim();
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength);
        }
        // 기본적인 XSS 방지 (더 강력한 라이브러리 사용 권장 - 예: DOMPurify, sanitize-html)
        sanitized = sanitized.replace(/[<>"']/g, (match) => {
            switch (match) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                default: return match;
            }
        });
        return sanitized;
    }

    static maskSensitiveData(data, fieldsToMask = ['apiKey', 'password', 'token']) {
        if (typeof data !== 'object' || data === null) return data;
        const maskedData = { ...data };
        for (const field of fieldsToMask) {
            if (maskedData.hasOwnProperty(field)) {
                maskedData[field] = '***MASKED***';
            }
        }
        return maskedData;
    }

    static isValidUrl(string) {
        if (typeof string !== 'string') return false;
        try {
            new URL(string);
            return /^https?:\/\//.test(string); // http 또는 https 프로토콜로 시작하는지 확인
        } catch (_) {
            return false;
        }
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ===== 지리 유틸리티 =====
class GeoUtils {
    static isValidCoordinate(lat, lng) {
        const numLat = SafeUtils.safeParseFloat(lat);
        const numLng = SafeUtils.safeParseFloat(lng);
        if (isNaN(numLat) || isNaN(numLng)) return false;
        return numLat >= -90 && numLat <= 90 && numLng >= -180 && numLng <= 180;
    }

    static getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // 지구 반지름 (미터)
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // 미터 단위 거리
    }

    static addDistanceInfo(items, userLat, userLng, radius) {
        const lat = SafeUtils.safeParseFloat(userLat);
        const lng = SafeUtils.safeParseFloat(userLng);
        const rad = SafeUtils.safeParseFloat(radius);

        if (isNaN(lat) || isNaN(lng)) {
            return items;
        }

        return items.map(item => {
            const itemLat = SafeUtils.safeParseFloat(item.mapy);
            const itemLng = SafeUtils.safeParseFloat(item.mapx);
            if (!isNaN(itemLat) && !isNaN(itemLng)) {
                const distance = this.getDistance(lat, lng, itemLat, itemLng);
                item.distance = distance;
            }
            return item;
        }).filter(item => {
            if (isNaN(rad) || rad <= 0) return true;
            return item.distance !== undefined && item.distance <= rad;
        }).sort((a, b) => {
            if (a.distance === undefined && b.distance === undefined) return 0;
            if (a.distance === undefined) return 1;
            if (b.distance === undefined) return -1;
            return a.distance - b.distance;
        });
    }
}

// ===== 사용자 정의 에러 클래스 =====
class BaseError extends Error {
    constructor(message, code, statusCode, details = {}, i18n = null) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();
        this.i18n = i18n;

        if (this.i18n && this.i18n.getMessage) {
            this.localizedMessage = this.i18n.getMessage(code, details) || message;
        } else {
            this.localizedMessage = message;
        }

        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        } else {
            this.stack = new Error(message).stack;
        }
    }

    toJSON() {
        return {
            success: false,
            error: {
                name: this.name,
                code: this.code,
                message: this.localizedMessage,
                statusCode: this.statusCode,
                details: this.details,
                timestamp: this.timestamp,
            },
        };
    }
}

class TourismApiError extends BaseError {
    constructor(code = 'API_ERROR', operation = 'unknown', statusCode = 500, details = {}, metadata = {}, i18n = null) {
        const message = i18n ? i18n.getMessage(code, { operation, ...details }) : `Tourism API error during ${operation}`;
        super(message, code, statusCode, { operation, ...details }, i18n);
        this.operation = operation;
        this.metadata = metadata;
    }

    toJSON() {
        const baseJson = super.toJSON();
        baseJson.error.operation = this.operation;
        if (Object.keys(this.metadata).length > 0) {
            baseJson.metadata = this.metadata;
        }
        return baseJson;
    }
}

class ValidationError extends BaseError {
    constructor(message, field = 'unknown', value = 'unknown', i18n = null) {
        const localizedMessage = i18n ? i18n.getMessage('VALIDATION_ERROR_FIELD', { field, value, message }) : `Validation error for field '${field}': ${message}`;
        super(localizedMessage, 'VALIDATION_ERROR', 400, { field, value, originalMessage: message }, i18n);
        this.field = field;
        this.value = value;
    }

    toJSON() {
        const baseJson = super.toJSON();
        baseJson.error.field = this.field;
        baseJson.error.value = this.value;
        return baseJson;
    }
}

class ApiTimeoutError extends BaseError {
    constructor(timeout, operation = 'unknown', i18n = null) {
        const message = i18n ? i18n.getMessage('API_TIMEOUT', { timeout, operation }) : `API request timed out after ${timeout}ms for operation '${operation}'.`;
        super(message, 'API_TIMEOUT', 504, { timeout, operation }, i18n);
        this.timeout = timeout;
        this.operation = operation;
    }
}

class RateLimitError extends BaseError {
    constructor(limit, remaining, i18n = null) {
        const message = i18n ? i18n.getMessage('RATE_LIMIT_EXCEEDED', { limit, remaining }) : `Rate limit exceeded. Limit: ${limit}, Remaining: ${remaining}.`;
        super(message, 'RATE_LIMIT_EXCEEDED', 429, { limit, remaining }, i18n);
        this.limit = limit;
        this.remaining = remaining;
    }
}

class SecurityError extends BaseError {
    constructor(message = 'Security threat detected', code = 'SECURITY_ERROR', details = {}, i18n = null) {
        const localizedMessage = i18n ? i18n.getMessage(code, details) : message;
        super(localizedMessage, code, 403, details, i18n);
    }
}

// ===== 응답 포맷터 =====
class ResponseFormatter {
    static formatSuccess(operation, data, metadata = {}, performance = {}) {
        return {
            success: true,
            timestamp: new Date().toISOString(),
            operation,
            data,
            metadata,
            performance,
        };
    }

    static formatError(error, operation = 'unknown') {
        if (error instanceof BaseError) {
            const errorJson = error.toJSON();
            if (operation && !errorJson.error.operation) {
                 errorJson.error.operation = operation;
            }
            return errorJson;
        }

        const i18n = error.i18n;
        const message = i18n ? i18n.getMessage('UNKNOWN_ERROR') : 'An unexpected error occurred.';

        return {
            success: false,
            error: {
                name: error.name || 'Error',
                code: error.code || 'UNKNOWN_ERROR',
                message: error.message || message,
                statusCode: error.statusCode || 500,
                details: error.details || { originalError: String(error) },
                timestamp: new Date().toISOString(),
                operation: operation,
            },
        };
    }

    static addCacheInfo(data, isCached, cacheStats) {
        if (typeof data === 'object' && data !== null) {
            data.metadata = {
                ...data.metadata,
                cache: {
                    isCached,
                    ...(isCached && cacheStats ? cacheStats : {}),
                },
            };
        }
        return data;
    }
}

// ===== 서비스 컨테이너 =====
class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.instances = new Map();
        this.initialized = false;
    }

    register(name, factory) {
        if (this.services.has(name)) {
            console.warn(`Service ${name} is already registered. Overwriting.`);
        }
        this.services.set(name, factory);
        return this;
    }

    get(name) {
        if (!this.instances.has(name)) {
            if (!this.services.has(name)) {
                throw new Error(`Service ${name} not found`);
            }
            const factory = this.services.get(name);
            this.instances.set(name, factory(this));
        }
        return this.instances.get(name);
    }

    initialize() {
        if (this.initialized) return;
        for (const name of this.services.keys()) {
            this.get(name); // 모든 서비스 인스턴스화
        }
        this.initialized = true;
        console.log('Service container initialized with services:', Array.from(this.instances.keys()).join(', '));
    }

    isInitialized() {
        return this.initialized;
    }

    getInstancedServices() {
        return Array.from(this.instances.keys());
    }

    destroy() {
        for (const instance of this.instances.values()) {
            if (typeof instance.destroy === 'function') {
                try {
                    instance.destroy();
                } catch (error) {
                    console.warn(`Error destroying service ${instance.constructor.name}:`, error);
                }
            }
        }
        this.instances.clear();
        this.services.clear();
        this.initialized = false;
        console.log('Service container destroyed');
    }
}

// ===== 국제화 관리자 =====
class InternationalizationManager {
    constructor(defaultLanguage = 'ko') {
        this.currentLanguage = defaultLanguage;
        this.messages = {
            ko: {
                API_ERROR: 'API 오류가 발생했습니다 (작업: ${operation}).',
                VALIDATION_ERROR: '입력값 검증 오류가 발생했습니다.',
                VALIDATION_ERROR_FIELD: "필드 '${field}' 검증 오류: ${message}",
                API_TIMEOUT: 'API 요청 시간 초과 (${timeout}ms, 작업: ${operation}).',
                RATE_LIMIT_EXCEEDED: '요청 한도 초과. 한도: ${limit}, 남은 요청: ${remaining}.',
                SECURITY_ERROR: '보안 위협이 감지되었습니다.',
                UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다.',
                MISSING_API_KEY: 'TOURISM_API_KEY 환경변수가 설정되지 않았습니다. API 키를 설정해주세요.',
                INVALID_API_KEY: '제공된 API 키가 유효하지 않습니다.',
                UNSUPPORTED_OPERATION: "지원하지 않는 작업입니다: '${operation}'.",
                BATCH_DISABLED: '배치 요청 기능이 비활성화되어 있습니다.',
                BATCH_SIZE_EXCEEDED: '최대 ${max}개의 작업만 배치로 처리할 수 있습니다. (요청: ${actual})',
                INVALID_RANGE: "필드 '${field}'의 값이 유효한 범위를 벗어났습니다. (허용 범위: ${min} ~ ${max})",
                NUMERIC_ERROR: "필드 '${field}'는 숫자여야 합니다.",
                INVALID_FORMAT: "필드 '${field}'의 형식이 올바르지 않습니다.",
                INVALID_COORDINATES: "좌표값이 유효하지 않습니다 (위도: ${lat}, 경도: ${lng}).",
                MIN_LENGTH_ERROR: "최소 길이는 ${minLength}자 입니다. (현재: ${actual}자)",
                MAX_LENGTH_ERROR: "최대 길이는 ${maxLength}자 입니다. (현재: ${actual}자)",
                ENUM_ERROR: "허용된 값 중 하나여야 합니다: ${values}"
            },
            en: {
                API_ERROR: 'API error occurred (operation: ${operation}).',
                VALIDATION_ERROR: 'Input validation error occurred.',
                VALIDATION_ERROR_FIELD: "Validation error for field '${field}': ${message}",
                API_TIMEOUT: 'API request timed out after ${timeout}ms for operation \'${operation}\'.',
                RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Limit: ${limit}, Remaining: ${remaining}.',
                SECURITY_ERROR: 'Security threat detected.',
                UNKNOWN_ERROR: 'An unexpected error occurred.',
                MISSING_API_KEY: 'TOURISM_API_KEY environment variable is not set. Please configure the API key.',
                INVALID_API_KEY: 'The provided API key is invalid.',
                UNSUPPORTED_OPERATION: "Unsupported operation: '${operation}'.",
                BATCH_DISABLED: 'Batch request functionality is disabled.',
                BATCH_SIZE_EXCEEDED: 'Maximum batch size of ${max} exceeded. (Requested: ${actual})',
                INVALID_RANGE: "Field '${field}' is out of valid range. (Allowed: ${min} - ${max})",
                NUMERIC_ERROR: "Field '${field}' must be a number.",
                INVALID_FORMAT: "Field '${field}' has an invalid format.",
                INVALID_COORDINATES: "Invalid coordinates (Latitude: ${lat}, Longitude: ${lng}).",
                MIN_LENGTH_ERROR: "Minimum length is ${minLength}. (Actual: ${actual})",
                MAX_LENGTH_ERROR: "Maximum length is ${maxLength}. (Actual: ${actual})",
                ENUM_ERROR: "Must be one of the allowed values: ${values}"
            }
        };
    }

    setLanguage(language) {
        if (this.messages[language]) {
            this.currentLanguage = language;
        } else {
            console.warn(`Language '${language}' not supported. Using '${this.currentLanguage}'.`);
        }
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }

    getMessage(key, params = {}) {
        const langMessages = this.messages[this.currentLanguage] || this.messages.ko;
        let message = langMessages[key] || key;
        for (const paramKey in params) {
            message = message.replace(new RegExp(`\\$\\{${paramKey}\\}`, 'g'), params[paramKey]);
        }
        return message;
    }

    destroy() {
        console.log('InternationalizationManager destroyed');
    }
}

// ===== 상수 관리자 =====
class ConstantsManager {
    constructor() {
        this.CONTENT_TYPES = {
            '12': { ko: '관광지', en: 'Tourist Destination' },
            '14': { ko: '문화시설', en: 'Cultural Facility' },
            '15': { ko: '축제/공연/행사', en: 'Festival/Performance/Event' },
            '25': { ko: '여행코스', en: 'Travel Course' },
            '28': { ko: '레포츠', en: 'Leisure/Sports' },
            '32': { ko: '숙박', en: 'Accommodation' },
            '38': { ko: '쇼핑', en: 'Shopping' },
            '39': { ko: '음식점', en: 'Restaurant' }
        };

        this.AREA_CODES = {
            '1': { ko: '서울', en: 'Seoul' },
            '2': { ko: '인천', en: 'Incheon' },
            '3': { ko: '대전', en: 'Daejeon' },
            '4': { ko: '대구', en: 'Daegu' },
            '5': { ko: '광주', en: 'Gwangju' },
            '6': { ko: '부산', en: 'Busan' },
            '7': { ko: '울산', en: 'Ulsan' },
            '8': { ko: '세종', en: 'Sejong' },
            '31': { ko: '경기도', en: 'Gyeonggi-do' },
            '32': { ko: '강원도', en: 'Gangwon-do' },
            '33': { ko: '충청북도', en: 'Chungcheongbuk-do' },
            '34': { ko: '충청남도', en: 'Chungcheongnam-do' },
            '35': { ko: '경상북도', en: 'Gyeongsangbuk-do' },
            '36': { ko: '경상남도', en: 'Gyeongsangnam-do' },
            '37': { ko: '전라북도', en: 'Jeollabuk-do' },
            '38': { ko: '전라남도', en: 'Jeollanam-do' },
            '39': { ko: '제주도', en: 'Jeju-do' }
        };

        this.OPERATIONS = [
            'areaBasedList',
            'detailCommon',
            'detailIntro',
            'detailInfo',
            'detailImage',
            'searchKeyword',
            'searchFestival',
            'locationBasedList',
            'areaCode',
            'categoryCode'
        ];

        this.CACHE_SETTINGS = {
            defaultTTL: 60 * 60 * 1000, // 1시간
            shortTTL: 5 * 60 * 1000,    // 5분
            longTTL: 24 * 60 * 60 * 1000 // 24시간
        };

        this.API_SETTINGS = {
            baseUrl: 'http://apis.data.go.kr/B551011/KorService',
            defaultParams: {
                MobileOS: 'ETC',
                MobileApp: 'TourismAPI',
                _type: 'json'
            }
        };
    }

    getContentTypeName(contentTypeId, language = 'ko') {
        return this.CONTENT_TYPES[contentTypeId]?.[language] || contentTypeId;
    }

    getAreaName(areaCode, language = 'ko') {
        return this.AREA_CODES[areaCode]?.[language] || areaCode;
    }

    isValidOperation(operation) {
        return this.OPERATIONS.includes(operation);
    }

    destroy() {
        console.log('ConstantsManager destroyed');
    }
}

// ===== 설정 관리자 =====
class ConfigManager {
    constructor(container) {
        this.container = container;
        this.config = {
            version: '2.1.1', // 버전 업데이트
            environment: hasProcess ? process.env.NODE_ENV || 'development' : 'browser',
            apiKey: hasProcess ? process.env.TOURISM_API_KEY : null,
            apiBaseUrl: 'http://apis.data.go.kr/B551011/KorService',
            defaultLanguage: 'ko',
            cacheEnabled: true,
            cacheTTL: 60 * 60 * 1000, // 1시간
            rateLimitEnabled: true,
            rateLimit: 100, // 분당 요청 수
            rateLimitWindow: 60 * 1000, // 1분
            enableBatching: true,
            logLevel: 'info',
            logFormat: 'json',
            logToConsole: true,
            logToFile: false,
            logFilePath: './logs/tourism-api.log',
            metricsEnabled: true,
            metricsInterval: 60 * 1000, // 1분
            allowedOrigins: '*'
        };
    }

    get(key) {
        return this.config[key];
    }

    set(key, value) {
        this.config[key] = value;
        return this;
    }

    getAll() {
        return { ...this.config };
    }

    getPublicConfig() {
        const { apiKey, ...publicConfig } = this.config;
        return publicConfig;
    }

    validateConfig() {
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        let isValid = true;

        if (!this.get('apiKey') && hasProcess) {
            logger.warn(i18n.getMessage('MISSING_API_KEY'));
            // 프로덕션 환경에서는 API 키가 없으면 에러를 발생시킬 수 있습니다.
            // 여기서는 경고만 표시하고, API 호출 시점에서 에러를 발생시킵니다.
            // isValid = false; 
        }

        if (!['debug', 'info', 'warn', 'error'].includes(this.get('logLevel'))) {
            logger.warn(`Invalid logLevel: ${this.get('logLevel')}. Defaulting to 'info'.`);
            this.set('logLevel', 'info');
        }
        return isValid;
    }

    destroy() {
        console.log('ConfigManager destroyed');
    }
}

// ===== 로거 =====
class Logger {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
        this.currentLevel = this.levels[this.config.get('logLevel')] || this.levels.info;
        this.metrics = {};
    }

    _log(level, message, data = {}) {
        if (this.levels[level] < this.currentLevel) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...data,
            environment: this.config.get('environment'),
            version: this.config.get('version')
        };

        if (this.config.get('logToConsole')) {
            if (this.config.get('logFormat') === 'json') {
                console[level](JSON.stringify(logEntry));
            } else {
                console[level](`[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}`, data);
            }
        }

        if (this.config.get('logToFile')) {
            // 파일 로깅 구현 (예: fs.appendFile)
        }

        this._updateMetrics(level, data);
    }

    _updateMetrics(level, data) {
        if (!this.config.get('metricsEnabled')) return;

        const metricKey = `log_${level}_count`;
        this.metrics[metricKey] = (this.metrics[metricKey] || 0) + 1;

        if (data.responseTime) {
            const responseTimeKey = 'api_response_time_ms';
            if (!this.metrics[responseTimeKey]) {
                this.metrics[responseTimeKey] = { count: 0, sum: 0, avg: 0 };
            }
            this.metrics[responseTimeKey].count++;
            this.metrics[responseTimeKey].sum += data.responseTime;
            this.metrics[responseTimeKey].avg = this.metrics[responseTimeKey].sum / this.metrics[responseTimeKey].count;
        }
    }

    debug(message, data = {}) { this._log('debug', message, data); }
    info(message, data = {}) { this._log('info', message, data); }
    warn(message, data = {}) { this._log('warn', message, data); }
    error(message, data = {}) { this._log('error', message, data); }

    getMetrics() {
        return { ...this.metrics };
    }

    getMemoryInfo() {
        if (hasProcess && process.memoryUsage) {
            const usage = process.memoryUsage();
            return {
                rss: usage.rss, // Resident Set Size
                heapTotal: usage.heapTotal, // V8's heap total size
                heapUsed: usage.heapUsed, // V8's heap used size
                external: usage.external, // External memory usage (C++ objects bound to JS objects)
                arrayBuffers: usage.arrayBuffers // Memory allocated for ArrayBuffers and SharedArrayBuffers
            };
        }
        return {};
    }

    destroy() {
        console.log('Logger destroyed');
    }
}

// ===== 고급 캐시 =====
class AdvancedCache {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.logger = container.get('logger');
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            size: 0,
            hitRate: 0
        };
        this.lastCleanup = Date.now();
        this.cleanupInterval = 5 * 60 * 1000; // 5분마다 만료된 항목 정리
    }

    generateKey(operation, params) {
        try {
            const sortedParams = {};
            Object.keys(params)
                .sort()
                .forEach(key => {
                    sortedParams[key] = params[key];
                });

            const keyString = `${operation}:${JSON.stringify(sortedParams)}`;
            return keyString;
        } catch (error) {
            this.logger.warn('캐시 키 생성 오류', { error: error.message, operation, params });
            return `${operation}:${Date.now()}:${Math.random()}`;
        }
    }

    get(key) {
        if (!this.config.get('cacheEnabled')) return null;

        this._cleanup();

        const item = this.cache.get(key);
        if (!item) {
            this.stats.misses++;
            this._updateHitRate();
            return null;
        }

        if (item.expires < Date.now()) {
            this.cache.delete(key);
            this.stats.size = this.cache.size;
            this.stats.misses++;
            this._updateHitRate();
            return null;
        }

        this.stats.hits++;
        this._updateHitRate();
        item.lastAccessed = Date.now();
        item.accessCount++;
        return item.value;
    }

    set(key, value, ttl) {
        if (!this.config.get('cacheEnabled')) return;

        const defaultTTL = this.container.get('constants').CACHE_SETTINGS.defaultTTL;
        const expires = Date.now() + (ttl || defaultTTL);

        this.cache.set(key, {
            value,
            expires,
            created: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 0
        });

        this.stats.sets++;
        this.stats.size = this.cache.size;
        this._cleanup();
    }

    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.stats.deletes++;
            this.stats.size = this.cache.size;
        }
        return deleted;
    }

    clear() {
        this.cache.clear();
        this.stats.size = 0;
        this.stats.deletes++;
        this.logger.info('캐시가 초기화되었습니다');
    }

    getStats() {
        return { ...this.stats };
    }

    getTopItems(limit = 10) {
        const items = Array.from(this.cache.entries())
            .map(([key, item]) => ({
                key,
                accessCount: item.accessCount,
                lastAccessed: item.lastAccessed,
                expires: item.expires,
                ttl: item.expires - Date.now()
            }))
            .sort((a, b) => b.accessCount - a.accessCount)
            .slice(0, limit);

        return items;
    }

    _updateHitRate() {
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    }

    _cleanup() {
        const now = Date.now();
        if (now - this.lastCleanup < this.cleanupInterval) return;

        this.lastCleanup = now;
        let expiredCount = 0;

        for (const [key, item] of this.cache.entries()) {
            if (item.expires < now) {
                this.cache.delete(key);
                expiredCount++;
            }
        }

        if (expiredCount > 0) {
            this.stats.size = this.cache.size;
            this.logger.debug('캐시 정리 완료', { expiredCount, remainingSize: this.cache.size });
        }
    }

    destroy() {
        this.cache.clear();
        this.logger.info('캐시가 정리되었습니다');
    }
}

// ===== 속도 제한 관리자 =====
class RateLimiter {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.logger = container.get('logger');
        this.requests = new Map();
        this.limit = this.config.get('rateLimit') || 100;
        this.window = this.config.get('rateLimitWindow') || 60 * 1000; // 1분
        this.enabled = this.config.get('rateLimitEnabled') !== false;
        this.stats = {
            totalRequests: 0,
            limitedRequests: 0,
            currentWindowRequests: 0
        };
    }

    isAllowed(requestId) {
        if (!this.enabled) return true;

        const now = Date.now();
        this._cleanup(now);

        this.stats.totalRequests++;
        this.stats.currentWindowRequests = this.requests.size;

        const currentCount = this._getCurrentCount(now);

        if (currentCount >= this.limit) {
            this.stats.limitedRequests++;
            this.logger.warn('속도 제한 초과', {
                requestId,
                currentCount,
                limit: this.limit
            });
            return false;
        }

        this._addRequest(requestId, now);
        return true;
    }

    getRemainingQuota(requestId) {
        if (!this.enabled) return this.limit;

        const now = Date.now();
        this._cleanup(now);
        const currentCount = this._getCurrentCount(now);
        return Math.max(0, this.limit - currentCount);
    }

    getStats() {
        return {
            ...this.stats,
            enabled: this.enabled,
            limit: this.limit,
            window: this.window,
            remaining: this.limit - this.stats.currentWindowRequests
        };
    }

    _getCurrentCount(now) {
        this._cleanup(now);
        return this.requests.size;
    }

    _addRequest(requestId, now) {
        this.requests.set(requestId, {
            timestamp: now,
            requestId
        });
    }

    _cleanup(now) {
        const cutoff = now - this.window;
        for (const [id, request] of this.requests.entries()) {
            if (request.timestamp < cutoff) {
                this.requests.delete(id);
            }
        }
        this.stats.currentWindowRequests = this.requests.size;
    }

    destroy() {
        this.requests.clear();
        this.logger.info('속도 제한 관리자가 정리되었습니다');
    }
}

// ===== HTTP 클라이언트 =====
class HttpClient {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.logger = container.get('logger');
        this.constants = container.get('constants');
        this.i18n = container.get('i18n'); // i18n 추가
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalResponseTime: 0,
            averageResponseTime: 0
        };
    }

    async getTourismData(operation, params, options = {}) {
        const startTime = Date.now();
        const requestId = options.requestId || SafeUtils.generateRequestId();
        const apiKey = this.config.get('apiKey');
        const baseUrl = this.config.get('apiBaseUrl') || this.constants.API_SETTINGS.baseUrl;

        if (!apiKey) {
            this.logger.error(this.i18n.getMessage('MISSING_API_KEY'), { operation, requestId });
            throw new TourismApiError(
                'MISSING_API_KEY',
                operation,
                500, // 서버 설정 오류이므로 500 반환
                { message: this.i18n.getMessage('MISSING_API_KEY') },
                { requestId },
                this.i18n
            );
        }

        const url = new URL(`${baseUrl}/${operation}`);

        const defaultParams = {
            ServiceKey: apiKey,
            MobileOS: 'ETC',
            MobileApp: 'TourismAPI',
            _type: 'json',
            ...this.constants.API_SETTINGS.defaultParams
        };

        Object.entries({ ...defaultParams, ...params }).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.append(key, value);
            }
        });

        this.logger.debug('API 요청 시작', {
            requestId,
            operation,
            url: url.toString().replace(apiKey, '***MASKED***')
        });

        this.stats.totalRequests++;

        try {
            let response;
            if (hasProcess && typeof fetch === 'undefined') {
                // Node.js 17 이전 버전 대응
                const { default: nodeFetch } = await import('node-fetch');
                response = await nodeFetch(url.toString());
            } else {
                // 브라우저 또는 최신 Node.js
                response = await fetch(url.toString());
            }

            if (!response.ok) {
                let errorBody = null;
                try {
                    errorBody = await response.json();
                } catch (e) { /* 무시 */ }

                this.logger.error('API 응답 오류', {
                    requestId, operation, status: response.status, statusText: response.statusText, body: errorBody
                });
                throw new TourismApiError(
                    'API_RESPONSE_ERROR', // 더 구체적인 에러 코드
                    operation,
                    response.status,
                    {
                        status: response.status,
                        statusText: response.statusText,
                        body: errorBody
                    },
                    { requestId },
                    this.i18n
                );
            }

            const data = await response.json();
            const responseTime = Date.now() - startTime;

            const resultCode = data.response?.header?.resultCode;
            const resultMsg = data.response?.header?.resultMsg;

            if (resultCode !== '0000') {
                 this.logger.warn('API 결과 코드 오류', {
                    requestId, operation, resultCode, resultMsg
                });
                // 한국관광공사 API 오류 코드에 따라 다른 처리 가능
                let customErrorCode = 'API_LOGIC_ERROR';
                let statusCode = 500;
                if (resultCode === '0001') customErrorCode = 'APPLICATION_ERROR'; // 어플리케이션 에러
                else if (resultCode === '0002') customErrorCode = 'DB_ERROR'; // 데이터베이스 에러
                else if (resultCode === '0003') customErrorCode = 'NODATA_ERROR'; // 데이터 없음
                else if (resultCode === '0004') customErrorCode = 'HTTP_ERROR'; // HTTP 에러
                else if (resultCode === '0005') customErrorCode = 'SERVICETIMEOUT_ERROR'; // 서비스 연결 실패
                else if (resultCode === '0010') { customErrorCode = 'INVALID_REQUEST_PARAMETER_ERROR'; statusCode = 400; } // 잘못된 요청 파라메터
                else if (resultCode === '0011') { customErrorCode = 'NO_MANDATORY_REQUEST_PARAMETERS_ERROR'; statusCode = 400; } // 필수 요청 파라메터 없음
                else if (resultCode === '0012') customErrorCode = 'END_OF_SERVICE_ERROR'; // 해당 오픈 API 서비스가 없거나 폐기됨
                else if (resultCode === '0020') { customErrorCode = 'SERVICE_ACCESS_DENIED_ERROR'; statusCode = 403; } // 서비스 접근 거부
                else if (resultCode === '0021') { customErrorCode = 'TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR'; statusCode = 403; } // 일시적으로 사용할 수 없는 서비스 키
                else if (resultCode === '0022') { customErrorCode = 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR'; statusCode = 429; } // 서비스 요청제한횟수 초과
                else if (resultCode === '0030') customErrorCode = 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR'; // 등록되지 않은 서비스키
                else if (resultCode === '0031') { customErrorCode = 'DEADLINE_HAS_EXPIRED_ERROR'; statusCode = 403; } // 서비스 키 사용기간 만료
                else if (resultCode === '0032') customErrorCode = 'UNREGISTERED_IP_ERROR'; // 등록되지 않은 IP
                else if (resultCode === '9999') customErrorCode = 'UNKNOWN_ERROR'; // 기타 에러

                throw new TourismApiError(
                    customErrorCode,
                    operation,
                    statusCode,
                    {
                        resultCode,
                        resultMsg
                    },
                    { requestId },
                    this.i18n
                );
            }

            this.stats.successfulRequests++;
            this.stats.totalResponseTime += responseTime;
            this.stats.averageResponseTime = this.stats.totalResponseTime / this.stats.successfulRequests;

            this.logger.debug('API 요청 성공', {
                requestId,
                operation,
                responseTime,
                resultCode
            });

            return data;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.stats.failedRequests++;

            if (error instanceof TourismApiError || error instanceof BaseError) {
                throw error; // 이미 처리된 에러는 그대로 throw
            }

            // 예상치 못한 네트워크 오류 등
            this.logger.error('HTTP 클라이언트 오류', {
                requestId,
                operation,
                error: error.message,
                stack: error.stack, // 스택 트레이스 추가
                responseTime
            });

            throw new TourismApiError(
                'NETWORK_ERROR', // 더 구체적인 에러 코드
                operation,
                503, // Service Unavailable
                {
                    originalError: error.message
                },
                { requestId },
                this.i18n
            );
        }
    }

    getStats() {
        return { ...this.stats };
    }

    destroy() {
        this.logger.info('HTTP 클라이언트가 정리되었습니다');
    }
}

// ===== API 응답 처리기 =====
class ApiResponseProcessor {
    static extractItems(data) {
        try {
            const items = data.response?.body?.items?.item;
            if (!items) return [];
            return Array.isArray(items) ? items : [items];
        } catch (error) {
            // 에러 발생 시에도 빈 배열 반환 (방어적 코딩)
            console.warn('Error extracting items from API response:', error);
            return [];
        }
    }

    static processBasicItem(item, container) {
        try {
            if (!item) return null;

            const constants = container.get('constants');
            const i18n = container.get('i18n');
            const lang = i18n.getCurrentLanguage();

            return {
                contentid: item.contentid,
                contenttypeid: item.contenttypeid,
                title: this.sanitizeHtml(item.title),
                addr1: this.sanitizeHtml(item.addr1),
                addr2: this.sanitizeHtml(item.addr2),
                zipcode: item.zipcode,
                tel: this.sanitizeHtml(item.tel),
                firstimage: this.validateImageUrl(item.firstimage),
                firstimage2: this.validateImageUrl(item.firstimage2),
                mapx: this.sanitizeCoordinate(item.mapx),
                mapy: this.sanitizeCoordinate(item.mapy),
                areacode: item.areacode,
                sigungucode: item.sigungucode,
                cat1: item.cat1,
                cat2: item.cat2,
                cat3: item.cat3,
                overview: SafeUtils.sanitizeInput(item.overview, 2000, { // 길이 증가
                    allowedTags: ['br', 'p', 'a', 'strong', 'em', 'ul', 'ol', 'li', 'b', 'i', 'u', 's', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td']
                }),
                homepage: SafeUtils.sanitizeInput(item.homepage, 1000, {
                    allowedTags: ['a']
                }),
                createdtime: this.formatDate(item.createdtime),
                modifiedtime: this.formatDate(item.modifiedtime),
                meta: {
                    contentTypeName: constants.getContentTypeName(item.contenttypeid, lang),
                    areaName: constants.getAreaName(item.areacode, lang),
                    hasImage: !!(item.firstimage || item.firstimage2),
                    hasCoordinates: !!(item.mapx && item.mapy),
                    hasOverview: !!item.overview,
                    hasHomepage: !!item.homepage,
                    completeness: this.calculateCompleteness(item),
                    lastUpdated: item.modifiedtime ? this.formatDate(item.modifiedtime) : null
                }
            };
        } catch (error) {
            console.warn('Error processing basic item:', { item, error: error.message, stack: error.stack });
            return null;
        }
    }

    static sanitizeHtml(input) {
        if (!input || typeof input !== 'string') return input;
        // DOMPurify와 같은 전문 라이브러리 사용을 강력히 권장합니다.
        // 여기서는 매우 기본적인 태그 제거만 수행합니다.
        return input.replace(/<[^>]*>/g, '').trim();
    }

    static validateImageUrl(url) {
        if (!url || typeof url !== 'string') return null;
        if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
        try {
            new URL(url);
        } catch {
            return null;
        }
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        const hasValidExtension = imageExtensions.some(ext => url.toLowerCase().endsWith(ext));
        return hasValidExtension ? url : null;
    }

    static sanitizeCoordinate(coord) {
        if (!coord) return null;
        const num = SafeUtils.safeParseFloat(coord);
        if (isNaN(num)) return null;
        if (Math.abs(num) > 180) return null; // 경도는 180, 위도는 90
        return num;
    }

    static formatDate(dateString) {
        if (!dateString) return null;
        try {
            if (/^\d{14}$/.test(dateString)) {
                const y = dateString.substring(0, 4), m = dateString.substring(4, 6), d = dateString.substring(6, 8);
                const h = dateString.substring(8, 10), min = dateString.substring(10, 12), s = dateString.substring(12, 14);
                if (!this.isValidDateTime(parseInt(y), parseInt(m), parseInt(d), parseInt(h), parseInt(min), parseInt(s))) return null;
                return `${y}-${m}-${d}T${h}:${min}:${s}`;
            }
            if (/^\d{8}$/.test(dateString)) {
                const y = dateString.substring(0, 4), m = dateString.substring(4, 6), d = dateString.substring(6, 8);
                if (!this.isValidDate(parseInt(y), parseInt(m), parseInt(d))) return null;
                return `${y}-${m}-${d}`;
            }
            if (dateString.includes('T') || dateString.includes('-')) {
                const date = new Date(dateString);
                return isNaN(date.getTime()) ? null : dateString;
            }
            return dateString;
        } catch (error) {
            return null;
        }
    }

    static isValidDate(year, month, day) {
        if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && !isNaN(date.getTime());
    }

    static isValidDateTime(year, month, day, hour, minute, second) {
        if (!this.isValidDate(year, month, day) || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return false;
        const date = new Date(year, month - 1, day, hour, minute, second);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day &&
               date.getHours() === hour && date.getMinutes() === minute && date.getSeconds() === second && !isNaN(date.getTime());
    }

    static calculateCompleteness(item) {
        const fields = ['title', 'addr1', 'tel', 'firstimage', 'mapx', 'mapy', 'overview', 'homepage', 'cat1', 'cat2', 'cat3'];
        const filledFields = fields.filter(field => {
            const value = item[field];
            return value && value !== '' && value !== '0' && value !== 'null';
        }).length;
        return Math.round((filledFields / fields.length) * 100);
    }

    static processImageItem(item) {
        try {
            if (!item) return null;
            return {
                contentid: item.contentid,
                imgname: this.sanitizeHtml(item.imgname),
                originimgurl: this.validateImageUrl(item.originimgurl),
                smallimageurl: this.validateImageUrl(item.smallimageurl),
                serialnum: item.serialnum,
                cpyrhtDivCd: item.cpyrhtDivCd // 저작권 유형 (Type1:제1유형(출처표시), Type3:제3유형(제1유형+변경금지))
            };
        } catch (error) {
            console.warn('Error processing image item:', { item, error: error.message, stack: error.stack });
            return null;
        }
    }

    static processCodeItem(item) {
        try {
            if (!item) return null;
            return {
                code: item.code,
                name: this.sanitizeHtml(item.name),
                rnum: item.rnum
            };
        } catch (error) {
            console.warn('Error processing code item:', { item, error: error.message, stack: error.stack });
            return null;
        }
    }

    destroy() {
        console.log('ApiResponseProcessor destroyed');
    }
}

// ===== 고급 입력 검증기 =====
class InputValidator {
    constructor(container) {
        this.container = container;
        this.logger = container.get('logger');
        this.i18n = container.get('i18n');
        this.schemas = new Map();
        this.customValidators = new Map();
        this._destroyed = false;
        this.initializeDefaultSchemas();
        this.initializeCustomValidators();
    }

    initializeCustomValidators() {
        this.addCustomValidator('contentId', (value) => /^\d+$/.test(value) && parseInt(value) > 0);
        this.addCustomValidator('latitude', (value) => GeoUtils.isValidCoordinate(value, 0));
        this.addCustomValidator('longitude', (value) => GeoUtils.isValidCoordinate(0, value));
        this.addCustomValidator('areaCode', (value) => Object.keys(this.container.get('constants').AREA_CODES).includes(value));
        this.addCustomValidator('dateFormat', (value) => /^\d{8}$/.test(value) && this.isValidDateString(value));
    }

    isValidDateString(dateString) {
        const year = parseInt(dateString.substring(0, 4));
        const month = parseInt(dateString.substring(4, 6));
        const day = parseInt(dateString.substring(6, 8));
        return ApiResponseProcessor.isValidDate(year, month, day);
    }

    initializeDefaultSchemas() {
        this.schemas.set('detailCommon', {
            contentId: {
                type: 'string',
                required: true,
                pattern: /^\d+$/,
                custom: 'contentId',
                sanitize: true
            },
            contentTypeId: {
                type: 'string',
                enum: ['12', '14', '15', '25', '28', '32', '38', '39'],
                sanitize: true
            },
            defaultYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            firstImageYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            areacodeYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            catcodeYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            addrinfoYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            mapinfoYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            overviewYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' }
        });

        this.schemas.set('areaBasedList', {
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '10' },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'O', 'P', 'Q', 'R'], default: 'A' },
            contentTypeId: { type: 'string', enum: ['12', '14', '15', '25', '28', '32', '38', '39'], sanitize: true },
            areaCode: { type: 'string', pattern: /^\d{1,2}$/, custom: 'areaCode', sanitize: true },
            sigunguCode: { type: 'string', pattern: /^\d{1,5}$/, sanitize: true },
            cat1: { type: 'string', pattern: /^[A-Z]\d{2}$/, sanitize: true },
            cat2: { type: 'string', pattern: /^[A-Z]\d{4}$/, sanitize: true },
            cat3: { type: 'string', pattern: /^[A-Z]\d{6}$/, sanitize: true },
            listYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            modifiedtime: { type: 'string', pattern: /^\d{14}$/, sanitize: true }
        });

        this.schemas.set('searchKeyword', {
            keyword: { type: 'string', required: true, minLength: 1, maxLength: 100, sanitize: true },
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '10' },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'O', 'P', 'Q', 'R'], default: 'A' },
            contentTypeId: { type: 'string', enum: ['12', '14', '15', '25', '28', '32', '38', '39'], sanitize: true },
            areaCode: { type: 'string', pattern: /^\d{1,2}$/, custom: 'areaCode', sanitize: true },
            sigunguCode: { type: 'string', pattern: /^\d{1,5}$/, sanitize: true }
        });

        this.setupDetailSchemas();
        this.setupLocationSchemas();
        this.setupCodeSchemas();
    }

    setupDetailSchemas() {
        this.schemas.set('detailIntro', {
            contentId: { type: 'string', required: true, pattern: /^\d+$/, custom: 'contentId', sanitize: true },
            contentTypeId: { type: 'string', required: true, enum: ['12', '14', '15', '25', '28', '32', '38', '39'], sanitize: true }
        });

        this.schemas.set('detailInfo', {
            contentId: { type: 'string', required: true, pattern: /^\d+$/, custom: 'contentId', sanitize: true },
            contentTypeId: { type: 'string', required: true, enum: ['12', '14', '15', '25', '28', '32', '38', '39'], sanitize: true }
        });

        this.schemas.set('detailImage', {
            contentId: { type: 'string', required: true, pattern: /^\d+$/, custom: 'contentId', sanitize: true },
            imageYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            subImageYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' }
        });
    }

    setupLocationSchemas() {
        this.schemas.set('locationBasedList', {
            mapX: { type: 'string', required: true, pattern: /^-?\d+(\.\d+)?$/, custom: 'longitude', sanitize: true },
            mapY: { type: 'string', required: true, pattern: /^-?\d+(\.\d+)?$/, custom: 'latitude', sanitize: true },
            radius: { type: 'string', pattern: /^\d+$/, min: 1, max: 20000, default: '1000' },
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '10' },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'], default: 'A' },
            contentTypeId: { type: 'string', enum: ['12', '14', '15', '25', '28', '32', '38', '39'], sanitize: true }
        });

        this.schemas.set('searchFestival', {
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '10' },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'O', 'Q', 'R'], default: 'A' },
            eventStartDate: { type: 'string', pattern: /^\d{8}$/, custom: 'dateFormat', sanitize: true },
            eventEndDate: { type: 'string', pattern: /^\d{8}$/, custom: 'dateFormat', sanitize: true },
            areaCode: { type: 'string', pattern: /^\d{1,2}$/, custom: 'areaCode', sanitize: true },
            sigunguCode: { type: 'string', pattern: /^\d{1,5}$/, sanitize: true }
        });
    }

    setupCodeSchemas() {
        this.schemas.set('areaCode', {
            areaCode: { type: 'string', pattern: /^\d{1,2}$/, custom: 'areaCode', sanitize: true },
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '100' },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' }
        });

        this.schemas.set('categoryCode', {
            contentTypeId: { type: 'string', enum: ['12', '14', '15', '25', '28', '32', '38', '39'], sanitize: true },
            cat1: { type: 'string', pattern: /^[A-Z]\d{2}$/, sanitize: true },
            cat2: { type: 'string', pattern: /^[A-Z]\d{4}$/, sanitize: true },
            cat3: { type: 'string', pattern: /^[A-Z]\d{6}$/, sanitize: true }, // cat3 추가
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '100' },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' }
        });
    }

    validate(operation, params) {
        if (this._destroyed) throw new Error('InputValidator has been destroyed.');

        const schema = this.schemas.get(operation);
        if (!schema) {
            this.logger.warn('검증 스키마 없음', { operation });
            return params; // 스키마가 없으면 원본 파라미터 반환 (또는 에러 throw)
        }

        const validatedParams = {};
        const errors = [];

        for (const field in schema) {
            const rules = schema[field];
            let value = params[field];

            if (value === undefined || value === null || value === '') {
                if (rules.required) {
                    errors.push(`${field}: ${this.i18n.getMessage('VALIDATION_ERROR_FIELD', { field, message: '필수 항목입니다.' })}`);
                    continue;
                }
                if (rules.default !== undefined) {
                    value = rules.default;
                }
            }

            if (value !== undefined && value !== null && value !== '') {
                const validationResult = this._validateField(field, value, rules);
                if (validationResult.errors.length > 0) {
                    errors.push(...validationResult.errors);
                } else {
                    validatedParams[field] = validationResult.value;
                }
            }
        }

        // 추가적인 비즈니스 로직 검증
        this.validateBusinessLogic(operation, { ...params, ...validatedParams }, errors);

        if (errors.length > 0) {
            this.logger.warn('입력값 검증 실패', { operation, errors, originalParams: params });
            throw new ValidationError(errors.join(', '), 'multiple', params, this.i18n);
        }

        return validatedParams;
    }

    _validateField(field, value, rules) {
        const result = { value: undefined, errors: [] };
        let sanitizedValue = value;

        try {
            if (rules.sanitize && typeof value === 'string') {
                sanitizedValue = SafeUtils.sanitizeInput(value, rules.maxLength || 1000);
            }

            if (rules.type) {
                if (rules.type === 'string' && typeof sanitizedValue !== 'string') {
                    sanitizedValue = String(sanitizedValue);
                }
                // 다른 타입 검증 추가 가능 (number, boolean 등)
            }

            if (rules.pattern && typeof sanitizedValue === 'string') {
                const regex = new RegExp(rules.pattern);
                if (!regex.test(sanitizedValue)) {
                    result.errors.push(`${field}: ${this.i18n.getMessage('INVALID_FORMAT', { field })} (패턴: ${rules.pattern})`);
                    return result;
                }
            }

            if (typeof sanitizedValue === 'string') {
                if (rules.minLength && sanitizedValue.length < rules.minLength) {
                    result.errors.push(`${field}: ${this.i18n.getMessage('MIN_LENGTH_ERROR', {
                        minLength: rules.minLength,
                        actual: sanitizedValue.length
                    })}`);
                    return result;
                }

                if (rules.maxLength && sanitizedValue.length > rules.maxLength) {
                    result.errors.push(`${field}: ${this.i18n.getMessage('MAX_LENGTH_ERROR', {
                        maxLength: rules.maxLength,
                        actual: sanitizedValue.length
                    })}`);
                    return result;
                }
            }

            if (rules.min !== undefined || rules.max !== undefined) {
                const numValue = SafeUtils.safeParseFloat(sanitizedValue);
                if (isNaN(numValue)) {
                    result.errors.push(`${field}: ${this.i18n.getMessage('NUMERIC_ERROR', { field })}`);
                    return result;
                } else {
                    if (rules.min !== undefined && numValue < rules.min) {
                        result.errors.push(`${field}: ${this.i18n.getMessage('INVALID_RANGE', {
                            field,
                            min: rules.min,
                            max: rules.max || '∞'
                        })}`);
                        return result;
                    }
                    if (rules.max !== undefined && numValue > rules.max) {
                        result.errors.push(`${field}: ${this.i18n.getMessage('INVALID_RANGE', {
                            field,
                            min: rules.min || '-∞',
                            max: rules.max
                        })}`);
                        return result;
                    }
                }
            }

            if (rules.enum && !rules.enum.includes(sanitizedValue)) {
                result.errors.push(`${field}: ${this.i18n.getMessage('ENUM_ERROR', {
                    values: rules.enum.join(', ')
                })}`);
                return result;
            }

            if (rules.custom && this.customValidators.has(rules.custom)) {
                const customValidator = this.customValidators.get(rules.custom);
                if (!customValidator(sanitizedValue)) {
                    result.errors.push(`${field}: ${this.i18n.getMessage('INVALID_FORMAT', { field })}`);
                    return result;
                }
            }

            result.value = sanitizedValue;
            return result;

        } catch (error) {
            this.logger.error('Field validation error', {
                field,
                error: error.message,
                stack: error.stack // 스택 트레이스 추가
            });
            result.errors.push(`${field}: validation failed due to unexpected error`);
            return result;
        }
    }

    validateBusinessLogic(operation, params, errors) {
        try {
            if (operation === 'searchFestival' && params.eventStartDate && params.eventEndDate) {
                const startDateNum = SafeUtils.safeParseInt(params.eventStartDate);
                const endDateNum = SafeUtils.safeParseInt(params.eventEndDate);

                if (!isNaN(startDateNum) && !isNaN(endDateNum) && startDateNum > endDateNum) {
                    errors.push(this.i18n.getMessage('INVALID_RANGE', {
                        field: 'eventStartDate/eventEndDate',
                        min: params.eventEndDate,
                        max: params.eventStartDate
                    }));
                }
            }

            if (params.userLat && params.userLng) {
                if (!GeoUtils.isValidCoordinate(params.userLat, params.userLng)) {
                    errors.push(this.i18n.getMessage('INVALID_COORDINATES', {
                        lat: params.userLat,
                        lng: params.userLng
                    }));
                }
            }

            if (operation === 'locationBasedList') {
                if (!params.mapX || !params.mapY) {
                    errors.push('locationBasedList에는 mapX, mapY가 필수입니다');
                }
            }

        } catch (error) {
            this.logger.error('Business logic validation error', {
                operation,
                error: error.message,
                stack: error.stack // 스택 트레이스 추가
            });
        }
    }

    addCustomValidator(name, validator) {
        if (typeof validator !== 'function') {
            throw new Error('Validator must be a function');
        }
        this.customValidators.set(name, validator);
    }

    removeCustomValidator(name) {
        return this.customValidators.delete(name);
    }

    getValidationSchema(operation) {
        return this.schemas.get(operation);
    }

    destroy() {
        if (this._destroyed) return;

        this.schemas.clear();
        this.customValidators.clear();
        this._destroyed = true;
        this.logger.info('Input validator destroyed');
    }
}


// ===== 메인 API 클래스 =====
class AllTourismAPI {
    constructor() {
        this.container = new ServiceContainer();
        this.setupServices();
        this.container.initialize();
        this.container.get('config').validateConfig(); // 설정 유효성 검사 추가
    }

    setupServices() {
        this.container
            .register('config', (container) => new ConfigManager(container))
            .register('i18n', () => new InternationalizationManager())
            .register('constants', () => new ConstantsManager())
            .register('logger', (container) => new Logger(container))
            .register('cache', (container) => new AdvancedCache(container))
            .register('rateLimiter', (container) => new RateLimiter(container))
            .register('validator', (container) => new InputValidator(container))
            .register('httpClient', (container) => new HttpClient(container));
    }

    getSystemStatus() {
        try {
            const config = this.container.get('config');
            const logger = this.container.get('logger');
            const cache = this.container.get('cache');
            const rateLimiter = this.container.get('rateLimiter');
            const httpClient = this.container.get('httpClient');

            return {
                success: true,
                timestamp: new Date().toISOString(),
                system: {
                    version: config.get('version'),
                    environment: config.get('environment'),
                    isInitialized: this.container.isInitialized(),
                    services: this.container.getInstancedServices(),
                    uptime: Date.now() - SERVICE_START_TIME,
                    memory: logger.getMemoryInfo(),
                    apiKeyConfigured: !!config.get('apiKey') // API 키 설정 여부 추가
                },
                config: config.getPublicConfig(),
                cache: cache.getStats(),
                rateLimiter: rateLimiter.getStats(),
                httpClient: httpClient.getStats()
            };
        } catch (error) {
            return {
                success: false,
                timestamp: new Date().toISOString(),
                error: {
                    message: error.message,
                    stack: error.stack
                }
            };
        }
    }

    clearCache() {
        try {
            const cache = this.container.get('cache');
            cache.clear();
            return {
                success: true,
                message: '캐시가 성공적으로 초기화되었습니다',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                error: {
                    message: error.message,
                    stack: error.stack
                },
                timestamp: new Date().toISOString()
            };
        }
    }

    async areaBasedList(params = {}) {
        const requestId = SafeUtils.generateRequestId();
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        const validator = this.container.get('validator');
        const cache = this.container.get('cache');
        const rateLimiter = this.container.get('rateLimiter');
        const httpClient = this.container.get('httpClient');

        try {
            logger.info('areaBasedList 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    i18n
                );
            }

            const validatedParams = validator.validate('areaBasedList', params);
            const cacheKey = cache.generateKey('areaBasedList', validatedParams);
            const cachedData = cache.get(cacheKey);

            if (cachedData) {
                logger.info('areaBasedList 캐시 히트', { requestId, cacheKey });
                return ResponseFormatter.addCacheInfo(cachedData, true, {
                    key: cacheKey,
                    timestamp: new Date().toISOString()
                });
            }

            const apiParams = {
                ...validatedParams,
                MobileOS: 'ETC',
                MobileApp: 'TourismAPI',
                _type: 'json'
            };

            const data = await httpClient.getTourismData('areaBasedList1', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ApiResponseProcessor.processBasicItem(item, this.container))
                .filter(Boolean);

            const result = ResponseFormatter.formatSuccess('areaBasedList', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                items: processedItems
            });

            cache.set(cacheKey, result);
            logger.info('areaBasedList 요청 완료', {
                requestId,
                itemCount: processedItems.length
            });

            return result;

        } catch (error) {
            logger.error('areaBasedList 오류', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            if (error instanceof BaseError) {
                error.operation = 'areaBasedList';
                throw error;
            }

            throw new TourismApiError(
                'API_ERROR',
                'areaBasedList',
                500,
                { originalError: error.message },
                { requestId },
                i18n
            );
        }
    }

    async detailCommon(params = {}) {
        const requestId = SafeUtils.generateRequestId();
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        const validator = this.container.get('validator');
        const cache = this.container.get('cache');
        const rateLimiter = this.container.get('rateLimiter');
        const httpClient = this.container.get('httpClient');

        try {
            logger.info('detailCommon 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    i18n
                );
            }

            const validatedParams = validator.validate('detailCommon', params);
            const cacheKey = cache.generateKey('detailCommon', validatedParams);
            const cachedData = cache.get(cacheKey);

            if (cachedData) {
                logger.info('detailCommon 캐시 히트', { requestId, cacheKey });
                return ResponseFormatter.addCacheInfo(cachedData, true, {
                    key: cacheKey,
                    timestamp: new Date().toISOString()
                });
            }

            const apiParams = {
                ...validatedParams,
                MobileOS: 'ETC',
                MobileApp: 'TourismAPI',
                _type: 'json'
            };

            const data = await httpClient.getTourismData('detailCommon1', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            const processedItem = items.length > 0 ? ApiResponseProcessor.processBasicItem(items[0], this.container) : null;

            const result = ResponseFormatter.formatSuccess('detailCommon', {
                item: processedItem
            });

            cache.set(cacheKey, result);
            logger.info('detailCommon 요청 완료', {
                requestId,
                contentId: validatedParams.contentId,
                success: !!processedItem
            });

            return result;

        } catch (error) {
            logger.error('detailCommon 오류', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            if (error instanceof BaseError) {
                error.operation = 'detailCommon';
                throw error;
            }

            throw new TourismApiError(
                'API_ERROR',
                'detailCommon',
                500,
                { originalError: error.message },
                { requestId },
                i18n
            );
        }
    }

    async detailIntro(params = {}) {
        const requestId = SafeUtils.generateRequestId();
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        const validator = this.container.get('validator');
        const cache = this.container.get('cache');
        const rateLimiter = this.container.get('rateLimiter');
        const httpClient = this.container.get('httpClient');

        try {
            logger.info('detailIntro 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    i18n
                );
            }

            const validatedParams = validator.validate('detailIntro', params);
            const cacheKey = cache.generateKey('detailIntro', validatedParams);
            const cachedData = cache.get(cacheKey);

            if (cachedData) {
                logger.info('detailIntro 캐시 히트', { requestId, cacheKey });
                return ResponseFormatter.addCacheInfo(cachedData, true, {
                    key: cacheKey,
                    timestamp: new Date().toISOString()
                });
            }

            const apiParams = {
                ...validatedParams,
                MobileOS: 'ETC',
                MobileApp: 'TourismAPI',
                _type: 'json'
            };

            const data = await httpClient.getTourismData('detailIntro1', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            // detailIntro는 단일 아이템을 반환하는 경우가 많음
            const processedItem = items.length > 0 ? items[0] : null; // 추가적인 처리가 필요하다면 ApiResponseProcessor에 추가

            const result = ResponseFormatter.formatSuccess('detailIntro', {
                item: processedItem
            });

            cache.set(cacheKey, result);
            logger.info('detailIntro 요청 완료', {
                requestId,
                contentId: validatedParams.contentId,
                success: !!processedItem
            });

            return result;

        } catch (error) {
            logger.error('detailIntro 오류', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            if (error instanceof BaseError) {
                error.operation = 'detailIntro';
                throw error;
            }

            throw new TourismApiError(
                'API_ERROR',
                'detailIntro',
                500,
                { originalError: error.message },
                { requestId },
                i18n
            );
        }
    }

    async detailInfo(params = {}) {
        const requestId = SafeUtils.generateRequestId();
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        const validator = this.container.get('validator');
        const cache = this.container.get('cache');
        const rateLimiter = this.container.get('rateLimiter');
        const httpClient = this.container.get('httpClient');

        try {
            logger.info('detailInfo 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    i18n
                );
            }

            const validatedParams = validator.validate('detailInfo', params);
            const cacheKey = cache.generateKey('detailInfo', validatedParams);
            const cachedData = cache.get(cacheKey);

            if (cachedData) {
                logger.info('detailInfo 캐시 히트', { requestId, cacheKey });
                return ResponseFormatter.addCacheInfo(cachedData, true, {
                    key: cacheKey,
                    timestamp: new Date().toISOString()
                });
            }

            const apiParams = {
                ...validatedParams,
                MobileOS: 'ETC',
                MobileApp: 'TourismAPI',
                _type: 'json'
            };

            const data = await httpClient.getTourismData('detailInfo1', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            // detailInfo는 여러 아이템을 반환할 수 있음 (예: 반복 정보)
            // 추가적인 처리가 필요하다면 ApiResponseProcessor에 추가

            const result = ResponseFormatter.formatSuccess('detailInfo', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                items: items
            });

            cache.set(cacheKey, result);
            logger.info('detailInfo 요청 완료', {
                requestId,
                contentId: validatedParams.contentId,
                itemCount: items.length
            });

            return result;

        } catch (error) {
            logger.error('detailInfo 오류', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            if (error instanceof BaseError) {
                error.operation = 'detailInfo';
                throw error;
            }

            throw new TourismApiError(
                'API_ERROR',
                'detailInfo',
                500,
                { originalError: error.message },
                { requestId },
                i18n
            );
        }
    }

    async detailImage(params = {}) {
        const requestId = SafeUtils.generateRequestId();
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        const validator = this.container.get('validator');
        const cache = this.container.get('cache');
        const rateLimiter = this.container.get('rateLimiter');
        const httpClient = this.container.get('httpClient');

        try {
            logger.info('detailImage 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    i18n
                );
            }

            const validatedParams = validator.validate('detailImage', params);
            const cacheKey = cache.generateKey('detailImage', validatedParams);
            const cachedData = cache.get(cacheKey);

            if (cachedData) {
                logger.info('detailImage 캐시 히트', { requestId, cacheKey });
                return ResponseFormatter.addCacheInfo(cachedData, true, {
                    key: cacheKey,
                    timestamp: new Date().toISOString()
                });
            }

            const apiParams = {
                ...validatedParams,
                MobileOS: 'ETC',
                MobileApp: 'TourismAPI',
                _type: 'json'
            };

            const data = await httpClient.getTourismData('detailImage1', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ApiResponseProcessor.processImageItem(item))
                .filter(Boolean);

            const result = ResponseFormatter.formatSuccess('detailImage', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                items: processedItems
            });

            cache.set(cacheKey, result);
            logger.info('detailImage 요청 완료', {
                requestId,
                contentId: validatedParams.contentId,
                itemCount: processedItems.length
            });

            return result;

        } catch (error) {
            logger.error('detailImage 오류', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            if (error instanceof BaseError) {
                error.operation = 'detailImage';
                throw error;
            }

            throw new TourismApiError(
                'API_ERROR',
                'detailImage',
                500,
                { originalError: error.message },
                { requestId },
                i18n
            );
        }
    }

    async searchKeyword(params = {}) {
        const requestId = SafeUtils.generateRequestId();
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        const validator = this.container.get('validator');
        const cache = this.container.get('cache');
        const rateLimiter = this.container.get('rateLimiter');
        const httpClient = this.container.get('httpClient');

        try {
            logger.info('searchKeyword 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    i18n
                );
            }

            const validatedParams = validator.validate('searchKeyword', params);
            const cacheKey = cache.generateKey('searchKeyword', validatedParams);
            const cachedData = cache.get(cacheKey);

            if (cachedData) {
                logger.info('searchKeyword 캐시 히트', { requestId, cacheKey });
                return ResponseFormatter.addCacheInfo(cachedData, true, {
                    key: cacheKey,
                    timestamp: new Date().toISOString()
                });
            }

            const apiParams = {
                ...validatedParams,
                MobileOS: 'ETC',
                MobileApp: 'TourismAPI',
                _type: 'json'
            };

            const data = await httpClient.getTourismData('searchKeyword1', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ApiResponseProcessor.processBasicItem(item, this.container))
                .filter(Boolean);

            const result = ResponseFormatter.formatSuccess('searchKeyword', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                items: processedItems
            });

            cache.set(cacheKey, result);
            logger.info('searchKeyword 요청 완료', {
                requestId,
                keyword: validatedParams.keyword,
                itemCount: processedItems.length
            });

            return result;

        } catch (error) {
            logger.error('searchKeyword 오류', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            if (error instanceof BaseError) {
                error.operation = 'searchKeyword';
                throw error;
            }

            throw new TourismApiError(
                'API_ERROR',
                'searchKeyword',
                500,
                { originalError: error.message },
                { requestId },
                i18n
            );
        }
    }

    async searchFestival(params = {}) {
        const requestId = SafeUtils.generateRequestId();
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        const validator = this.container.get('validator');
        const cache = this.container.get('cache');
        const rateLimiter = this.container.get('rateLimiter');
        const httpClient = this.container.get('httpClient');

        try {
            logger.info('searchFestival 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    i18n
                );
            }

            const validatedParams = validator.validate('searchFestival', params);
            const cacheKey = cache.generateKey('searchFestival', validatedParams);
            const cachedData = cache.get(cacheKey);

            if (cachedData) {
                logger.info('searchFestival 캐시 히트', { requestId, cacheKey });
                return ResponseFormatter.addCacheInfo(cachedData, true, {
                    key: cacheKey,
                    timestamp: new Date().toISOString()
                });
            }

            const apiParams = {
                ...validatedParams,
                MobileOS: 'ETC',
                MobileApp: 'TourismAPI',
                _type: 'json'
            };

            const data = await httpClient.getTourismData('searchFestival1', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ApiResponseProcessor.processBasicItem(item, this.container))
                .filter(Boolean);

            const result = ResponseFormatter.formatSuccess('searchFestival', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                items: processedItems
            });

            cache.set(cacheKey, result);
            logger.info('searchFestival 요청 완료', {
                requestId,
                eventStartDate: validatedParams.eventStartDate,
                itemCount: processedItems.length
            });

            return result;

        } catch (error) {
            logger.error('searchFestival 오류', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            if (error instanceof BaseError) {
                error.operation = 'searchFestival';
                throw error;
            }

            throw new TourismApiError(
                'API_ERROR',
                'searchFestival',
                500,
                { originalError: error.message },
                { requestId },
                i18n
            );
        }
    }

    async locationBasedList(params = {}) {
        const requestId = SafeUtils.generateRequestId();
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        const validator = this.container.get('validator');
        const cache = this.container.get('cache');
        const rateLimiter = this.container.get('rateLimiter');
        const httpClient = this.container.get('httpClient');

        try {
            logger.info('locationBasedList 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    i18n
                );
            }

            const validatedParams = validator.validate('locationBasedList', params);
            const cacheKey = cache.generateKey('locationBasedList', validatedParams);
            const cachedData = cache.get(cacheKey);

            if (cachedData) {
                logger.info('locationBasedList 캐시 히트', { requestId, cacheKey });
                return ResponseFormatter.addCacheInfo(cachedData, true, {
                    key: cacheKey,
                    timestamp: new Date().toISOString()
                });
            }

            const apiParams = {
                ...validatedParams,
                MobileOS: 'ETC',
                MobileApp: 'TourismAPI',
                _type: 'json'
            };

            const data = await httpClient.getTourismData('locationBasedList1', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ApiResponseProcessor.processBasicItem(item, this.container))
                .filter(Boolean);

            const result = ResponseFormatter.formatSuccess('locationBasedList', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                items: processedItems
            });

            cache.set(cacheKey, result);
            logger.info('locationBasedList 요청 완료', {
                requestId,
                mapX: validatedParams.mapX,
                mapY: validatedParams.mapY,
                itemCount: processedItems.length
            });

            return result;

        } catch (error) {
            logger.error('locationBasedList 오류', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            if (error instanceof BaseError) {
                error.operation = 'locationBasedList';
                throw error;
            }

            throw new TourismApiError(
                'API_ERROR',
                'locationBasedList',
                500,
                { originalError: error.message },
                { requestId },
                i18n
            );
        }
    }

    async areaCode(params = {}) {
        const requestId = SafeUtils.generateRequestId();
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        const validator = this.container.get('validator');
        const cache = this.container.get('cache');
        const rateLimiter = this.container.get('rateLimiter');
        const httpClient = this.container.get('httpClient');

        try {
            logger.info('areaCode 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    i18n
                );
            }

            const validatedParams = validator.validate('areaCode', params);
            const cacheKey = cache.generateKey('areaCode', validatedParams);
            const cachedData = cache.get(cacheKey);

            if (cachedData) {
                logger.info('areaCode 캐시 히트', { requestId, cacheKey });
                return ResponseFormatter.addCacheInfo(cachedData, true, {
                    key: cacheKey,
                    timestamp: new Date().toISOString()
                });
            }

            const apiParams = {
                ...validatedParams,
                MobileOS: 'ETC',
                MobileApp: 'TourismAPI',
                _type: 'json'
            };

            const data = await httpClient.getTourismData('areaCode1', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ApiResponseProcessor.processCodeItem(item))
                .filter(Boolean);

            const result = ResponseFormatter.formatSuccess('areaCode', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                items: processedItems
            });

            const constants = this.container.get('constants');
            cache.set(cacheKey, result, constants.CACHE_SETTINGS.longTTL);

            logger.info('areaCode 요청 완료', {
                requestId,
                itemCount: processedItems.length
            });

            return result;

        } catch (error) {
            logger.error('areaCode 오류', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            if (error instanceof BaseError) {
                error.operation = 'areaCode';
                throw error;
            }

            throw new TourismApiError(
                'API_ERROR',
                'areaCode',
                500,
                { originalError: error.message },
                { requestId },
                i18n
            );
        }
    }

    async categoryCode(params = {}) {
        const requestId = SafeUtils.generateRequestId();
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        const validator = this.container.get('validator');
        const cache = this.container.get('cache');
        const rateLimiter = this.container.get('rateLimiter');
        const httpClient = this.container.get('httpClient');

        try {
            logger.info('categoryCode 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    i18n
                );
            }

            const validatedParams = validator.validate('categoryCode', params);
            const cacheKey = cache.generateKey('categoryCode', validatedParams);
            const cachedData = cache.get(cacheKey);

            if (cachedData) {
                logger.info('categoryCode 캐시 히트', { requestId, cacheKey });
                return ResponseFormatter.addCacheInfo(cachedData, true, {
                    key: cacheKey,
                    timestamp: new Date().toISOString()
                });
            }

            const apiParams = {
                ...validatedParams,
                MobileOS: 'ETC',
                MobileApp: 'TourismAPI',
                _type: 'json'
            };

            const data = await httpClient.getTourismData('categoryCode1', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ApiResponseProcessor.processCodeItem(item))
                .filter(Boolean);

            const result = ResponseFormatter.formatSuccess('categoryCode', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                items: processedItems
            });

            const constants = this.container.get('constants');
            cache.set(cacheKey, result, constants.CACHE_SETTINGS.longTTL);
            
            logger.info('categoryCode 요청 완료', {
                requestId,
                itemCount: processedItems.length
            });

            return result;

        } catch (error) {
            logger.error('categoryCode 오류', {
                requestId,
                error: error.message,
                stack: error.stack
            });

            if (error instanceof BaseError) {
                error.operation = 'categoryCode';
                throw error;
            }

            throw new TourismApiError(
                'API_ERROR',
                'categoryCode',
                500,
                { originalError: error.message },
                { requestId },
                i18n
            );
        }
    }

    async batchRequest(operations = []) {
        const requestId = SafeUtils.generateRequestId();
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        const config = this.container.get('config');

        try {
            logger.info('배치 요청 시작', {
                requestId,
                operationCount: operations.length
            });

            if (!config.get('enableBatching')) {
                throw new TourismApiError(
                    'BATCH_DISABLED',
                    'batch',
                    403,
                    {},
                    { requestId },
                    i18n
                );
            }

            if (!Array.isArray(operations) || operations.length === 0) {
                throw new ValidationError(
                    'operations 배열이 필요합니다',
                    'operations',
                    operations,
                    i18n
                );
            }

            const maxBatchSize = 20;
            if (operations.length > maxBatchSize) {
                throw new ValidationError(
                    i18n.getMessage('BATCH_SIZE_EXCEEDED', {
                        max: maxBatchSize,
                        actual: operations.length
                    }),
                    'operations',
                    operations.length,
                    i18n
                );
            }

            const results = [];
            const errors = [];

            for (let i = 0; i < operations.length; i++) {
                const op = operations[i];
                const { operation, params = {} } = op;

                try {
                    if (!this.container.get('constants').isValidOperation(operation)) {
                        throw new ValidationError(
                            i18n.getMessage('UNSUPPORTED_OPERATION', { operation }),
                            'operation',
                            operation,
                            i18n
                        );
                    }

                    let result;
                    // 각 API 호출은 이미 try-catch로 감싸져 있으므로, 여기서는 호출만 수행
                    switch (operation) {
                        case 'areaBasedList': result = await this.areaBasedList(params); break;
                        case 'detailCommon': result = await this.detailCommon(params); break;
                        case 'detailIntro': result = await this.detailIntro(params); break;
                        case 'detailInfo': result = await this.detailInfo(params); break;
                        case 'detailImage': result = await this.detailImage(params); break;
                        case 'searchKeyword': result = await this.searchKeyword(params); break;
                        case 'searchFestival': result = await this.searchFestival(params); break;
                        case 'locationBasedList': result = await this.locationBasedList(params); break;
                        case 'areaCode': result = await this.areaCode(params); break;
                        case 'categoryCode': result = await this.categoryCode(params); break;
                        default:
                            throw new ValidationError(
                                i18n.getMessage('UNSUPPORTED_OPERATION', { operation }),
                                'operation',
                                operation,
                                i18n
                            );
                    }

                    results.push({
                        index: i,
                        success: true,
                        operation,
                        data: result.data,
                        metadata: result.metadata
                    });

                } catch (error) {
                    const errorResponse = ResponseFormatter.formatError(error, operation);
                    errors.push({
                        index: i,
                        success: false,
                        operation,
                        error: errorResponse.error,
                        metadata: errorResponse.metadata
                    });
                    logger.warn('배치 작업 중 오류 발생', { requestId, operation, error: error.message });
                }
            }

            const summary = {
                total: operations.length,
                successful: results.length,
                failed: errors.length
            };

            logger.info('배치 요청 완료', {
                requestId,
                summary
            });

            return ResponseFormatter.formatSuccess('batch', {
                summary,
                results,
                errors
            });

        } catch (error) {
            logger.error('배치 요청 처리 중 심각한 오류', {
                requestId,
                error: error.message,
                stack: error.stack
            });
            if (error instanceof BaseError) {
                error.operation = 'batch';
                throw error;
            }
            throw new TourismApiError(
                'API_ERROR',
                'batch',
                500,
                { originalError: error.message },
                { requestId },
                i18n
            );
        }
    }

    destroy() {
        if (this.container) {
            this.container.destroy();
        }
        console.log('AllTourismAPI instance destroyed');
    }
}

// ===== CORS 헤더 설정 =====
function setCorsHeaders(res, allowedOrigins = '*') {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization,X-API-KEY');
    res.setHeader('Access-Control-Allow-Credentials', true);
}

// ===== 헬스체크 함수 =====
async function healthCheck() {
    let api = null;
    try {
        api = new AllTourismAPI();
        const config = api.container.get('config');
        const apiKey = config.get('apiKey');
        const i18n = api.container.get('i18n');

        if (!apiKey && hasProcess) {
            return {
                status: 'error',
                message: i18n.getMessage('MISSING_API_KEY'),
                details: {
                    apiKeyConfigured: false,
                    environment: config.get('environment')
                }
            };
        }

        // 간단한 API 호출 테스트 (예: areaCode)
        // 실제 API 키 유효성 검사는 아님, API 서버 응답 확인용
        await api.areaCode({ numOfRows: '1' }); 

        return {
            status: 'ok',
            message: 'API is healthy and running',
            details: {
                version: config.get('version'),
                environment: config.get('environment'),
                apiKeyConfigured: !!apiKey,
                timestamp: new Date().toISOString()
            }
        };
    } catch (error) {
        console.warn('Health check failed:', error.message);
        return {
            status: 'error',
            message: 'API health check failed.',
            details: {
                error: error.message,
                code: error.code,
                statusCode: error.statusCode,
                apiKeyConfigured: !!(api && api.container.get('config').get('apiKey')),
                timestamp: new Date().toISOString()
            }
        };
    } finally {
        if (api) {
            api.destroy();
        }
    }
}

// ===== 메인 서버리스 함수 핸들러 =====
async function handler(req, res) {
    const requestId = SafeUtils.generateRequestId();
    const startTime = Date.now();
    let api = null;
    let logger = null;
    let i18n = null;
    let configManager = null;

    try {
        setCorsHeaders(res);

        if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
        }

        api = new AllTourismAPI();
        logger = api.container.get('logger');
        i18n = api.container.get('i18n');
        configManager = api.container.get('config');

        // 언어 설정 (쿼리 파라미터 또는 헤더에서 가져오기)
        const lang = req.query?.lang || req.headers?.['accept-language']?.split(',')[0]?.split('-')[0] || 'ko';
        i18n.setLanguage(lang);

        logger.info('요청 수신', {
            requestId,
            method: req.method,
            url: req.url,
            ip: req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress,
            userAgent: req.headers?.['user-agent'],
            language: lang
        });

        let params;
        try {
            if (req.method === 'GET') {
                params = req.query || {};
            } else if (req.method === 'POST') {
                const contentType = req.headers['content-type'] || '';
                if (contentType.includes('application/json')) {
                    // Vercel 환경에서는 req.body가 이미 파싱되어 있을 수 있음
                    params = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
                } else if (contentType.includes('application/x-www-form-urlencoded')) {
                    // x-www-form-urlencoded 파싱 (필요시 qs 라이브러리 사용)
                    const { parse } = await import('querystring');
                    let bodyStr = '';
                    if (typeof req.body === 'string') {
                        bodyStr = req.body;
                    } else if (req.on) { // Node.js 스트림인 경우
                        await new Promise((resolve, reject) => {
                            req.on('data', chunk => bodyStr += chunk);
                            req.on('end', resolve);
                            req.on('error', reject);
                        });
                    }
                    params = parse(bodyStr) || {};
                } else {
                    logger.warn('지원하지 않는 Content-Type', { contentType });
                    throw new ValidationError(
                        '지원하지 않는 Content-Type입니다. application/json 또는 application/x-www-form-urlencoded를 사용해주세요.',
                        'contentType',
                        contentType,
                        i18n
                    );
                }
            } else {
                throw new ValidationError(
                    '지원하지 않는 HTTP 메서드입니다',
                    'method',
                    req.method,
                    i18n
                );
            }
        } catch (parseError) {
            logger.error('요청 데이터 파싱 실패', { error: parseError.message, stack: parseError.stack });
            throw new ValidationError(
                '요청 데이터 파싱 실패: ' + parseError.message,
                'body',
                'malformed',
                i18n
            );
        }

        const { operation = 'areaBasedList', ...apiParams } = params;

        if (operation === 'health' || operation === 'healthCheck') {
            const healthStatus = await healthCheck();
            const response = {
                ...healthStatus,
                metadata: {
                    requestId,
                    totalTime: Date.now() - startTime,
                    version: configManager.get('version'),
                    timestamp: new Date().toISOString()
                }
            };
            res.status(200).json(response);
            return;
        }

        if (operation === 'systemStatus') {
            const systemStatus = api.getSystemStatus();
            systemStatus.metadata = {
                requestId,
                totalTime: Date.now() - startTime,
                version: configManager.get('version'),
                timestamp: new Date().toISOString()
            };
            res.status(200).json(systemStatus);
            return;
        }

        if (operation === 'clearCache') {
            const result = api.clearCache();
            result.metadata = {
                requestId,
                totalTime: Date.now() - startTime,
                version: configManager.get('version')
            };
            res.status(200).json(result);
            return;
        }

        if (operation === 'batch') {
            if (req.method !== 'POST') {
                throw new ValidationError(
                    '배치 요청은 POST 메서드만 지원합니다',
                    'method',
                    req.method,
                    i18n
                );
            }

            const { operations } = apiParams;
            const batchResult = await api.batchRequest(operations);
            batchResult.metadata = {
                ...batchResult.metadata,
                requestId,
                totalTime: Date.now() - startTime,
                version: configManager.get('version')
            };
            res.status(200).json(batchResult);
            return;
        }

        const constants = api.container.get('constants');
        if (!constants.isValidOperation(operation)) {
            throw new ValidationError(
                i18n.getMessage('UNSUPPORTED_OPERATION', { operation }),
                'operation',
                operation,
                i18n
            );
        }

        let result;

        switch (operation) {
            case 'areaBasedList': result = await api.areaBasedList(apiParams); break;
            case 'detailCommon': result = await api.detailCommon(apiParams); break;
            case 'detailIntro': result = await api.detailIntro(apiParams); break;
            case 'detailInfo': result = await api.detailInfo(apiParams); break;
            case 'detailImage': result = await api.detailImage(apiParams); break;
            case 'searchKeyword': result = await api.searchKeyword(apiParams); break;
            case 'searchFestival': result = await api.searchFestival(apiParams); break;
            case 'locationBasedList': result = await api.locationBasedList(apiParams); break;
            case 'areaCode': result = await api.areaCode(apiParams); break;
            case 'categoryCode': result = await api.categoryCode(apiParams); break;
            default:
                throw new ValidationError(
                    i18n.getMessage('UNSUPPORTED_OPERATION', { operation }),
                    'operation',
                    operation,
                    i18n
                );
        }

        if (!result.metadata) {
            result.metadata = {};
        }

        result.metadata = {
            ...result.metadata,
            requestId,
            totalTime: Date.now() - startTime,
            version: configManager.get('version'),
            timestamp: new Date().toISOString(),
            environment: configManager.get('environment'),
            language: i18n.getCurrentLanguage()
        };

        logger.info('요청 완료', {
            requestId,
            operation,
            success: result.success,
            totalTime: result.metadata.totalTime
        });

        res.status(200).json(result);

    } catch (error) {
        // console.error('Handler Error:', error); // 이미 로거에서 처리

        const errorResponse = ResponseFormatter.formatError(error, error.operation || 'unknown');

        if (!errorResponse.metadata) {
            errorResponse.metadata = {};
        }

        errorResponse.metadata = {
            ...errorResponse.metadata,
            requestId,
            totalTime: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            version: configManager ? configManager.get('version') : 'unknown',
            environment: configManager ? configManager.get('environment') : (hasProcess ? process.env.NODE_ENV || 'development' : 'unknown')
        };

        const statusCode = error.statusCode || 500;

        if (logger) {
            logger.error('핸들러 에러', {
                requestId,
                error: error.message,
                stack: error.stack,
                statusCode,
                operation: error.operation || 'unknown',
                details: error.details
            });
        } else {
            // 로거가 초기화되기 전에 에러 발생 시
            console.error('핸들러 에러 (로거 미초기화):', {
                 requestId, error: error.message, stack: error.stack, statusCode, operation: error.operation || 'unknown', details: error.details
            });
        }

        res.status(statusCode).json(errorResponse);
    } finally {
        if (api) {
            try {
                api.destroy();
            } catch (cleanupError) {
                if (logger) logger.warn('리소스 정리 경고:', { error: cleanupError.message });
                else console.warn('리소스 정리 경고 (로거 미초기화):', cleanupError);
            }
        }
    }
}

// ===== 배치 처리 전용 핸들러 =====
async function batchHandler(req, res) {
    const requestId = SafeUtils.generateRequestId();
    const startTime = Date.now();
    let api = null;
    let logger = null;

    try {
        setCorsHeaders(res);

        if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
        }

        if (req.method !== 'POST') {
            throw new ValidationError(
                '배치 요청은 POST 메서드만 지원합니다',
                'method',
                req.method
            );
        }

        api = new AllTourismAPI();
        logger = api.container.get('logger');
        const i18n = api.container.get('i18n');

        logger.info('배치 요청 수신', {
            requestId,
            method: req.method
        });

        const { operations, options = {} } = req.body || {};

        if (!Array.isArray(operations) || operations.length === 0) {
            throw new ValidationError(
                'operations 배열이 필요합니다',
                'operations',
                operations,
                i18n
            );
        }

        const maxBatchSize = options.maxBatchSize || 20;
        if (operations.length > maxBatchSize) {
            throw new ValidationError(
                i18n.getMessage('BATCH_SIZE_EXCEEDED', { max: maxBatchSize, actual: operations.length }),
                'operations',
                operations.length,
                i18n
            );
        }

        const batchOptions = {
            concurrency: Math.min(options.concurrency || 5, 10),
            timeout: options.timeout || 30000,
            stopOnError: options.stopOnError || false
        };

        logger.info('배치 처리 시작', {
            requestId,
            operationCount: operations.length,
            options: batchOptions
        });

        const batchResult = await api.batchRequest(operations);
        
        batchResult.metadata = {
            ...batchResult.metadata,
            requestId,
            totalTime: Date.now() - startTime,
            version: api.container.get('config').get('version'),
            timestamp: new Date().toISOString(),
            batchOptions
        };

        logger.info('배치 처리 완료', {
            requestId,
            total: operations.length,
            successful: batchResult.data.summary.successful,
            failed: batchResult.data.summary.failed,
            totalTime: batchResult.metadata.totalTime
        });

        res.status(200).json(batchResult);

    } catch (error) {
        const errorResponse = ResponseFormatter.formatError(error, 'batch');
        errorResponse.metadata = {
            requestId,
            totalTime: Date.now() - startTime,
            version: api ? api.container.get('config').get('version') : 'unknown',
            timestamp: new Date().toISOString()
        };

        if (logger) {
            logger.error('배치 핸들러 에러', {
                requestId,
                error: error.message,
                stack: error.stack,
                details: error.details
            });
        } else {
            console.error('배치 핸들러 에러 (로거 미초기화):', { requestId, error: error.message, stack: error.stack, details: error.details });
        }

        res.status(error.statusCode || 500).json(errorResponse);
    } finally {
        if (api) {
            try {
                api.destroy();
            } catch (destroyError) {
                if (logger) logger.warn('배치 API 인스턴스 정리 경고:', { error: destroyError.message });
                else console.warn('배치 API 인스턴스 정리 경고 (로거 미초기화):', destroyError);
            }
        }
    }
}

// ===== 메트릭 수집 핸들러 =====
async function metricsHandler(req, res) {
    let api = null;
    let logger = null;
    try {
        setCorsHeaders(res);

        if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
        }

        api = new AllTourismAPI();
        logger = api.container.get('logger');
        const cache = api.container.get('cache');
        const rateLimiter = api.container.get('rateLimiter');
        const config = api.container.get('config');

        const metrics = {
            timestamp: new Date().toISOString(),
            uptime: Date.now() - SERVICE_START_TIME,
            system: {
                memory: logger.getMemoryInfo(),
                version: config.get('version'),
                environment: config.get('environment')
            },
            metrics: logger.getMetrics(),
            cache: {
                ...cache.getStats(),
                topItems: cache.getTopItems(10)
            },
            rateLimiter: rateLimiter.getStats()
        };

        if (req.headers.accept?.includes('text/plain')) {
            const prometheusMetrics = formatPrometheusMetrics(metrics);
            res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
            res.status(200).send(prometheusMetrics);
        } else {
            res.status(200).json(metrics);
        }

    } catch (error) {
        const errorMsg = 'Metrics Handler Error: ' + error.message;
        if (logger) logger.error(errorMsg, { stack: error.stack });
        else console.error(errorMsg, error.stack);
        
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (api) {
            try {
                api.destroy();
            } catch (destroyError) {
                if (logger) logger.warn('Metrics API 인스턴스 정리 경고:', { error: destroyError.message });
                else console.warn('Metrics API 인스턴스 정리 경고 (로거 미초기화):', destroyError);
            }
        }
    }
}

// ===== Prometheus 메트릭 포맷터 =====
function formatPrometheusMetrics(metrics) {
    const lines = [];
    const prefix = 'tourism_api_';

    lines.push(`# HELP ${prefix}uptime_seconds API uptime in seconds`);
    lines.push(`# TYPE ${prefix}uptime_seconds gauge`);
    lines.push(`${prefix}uptime_seconds ${Math.floor(metrics.uptime / 1000)}`);

    if (metrics.system.memory.rss) {
        lines.push(`# HELP ${prefix}memory_rss_bytes Resident Set Size in bytes`);
        lines.push(`# TYPE ${prefix}memory_rss_bytes gauge`);
        lines.push(`${prefix}memory_rss_bytes ${metrics.system.memory.rss}`);
    }
    if (metrics.system.memory.heapUsed) {
        lines.push(`# HELP ${prefix}memory_heap_used_bytes V8 heap used in bytes`);
        lines.push(`# TYPE ${prefix}memory_heap_used_bytes gauge`);
        lines.push(`${prefix}memory_heap_used_bytes ${metrics.system.memory.heapUsed}`);
    }

    lines.push(`# HELP ${prefix}cache_hit_rate Cache hit rate percentage`);
    lines.push(`# TYPE ${prefix}cache_hit_rate gauge`);
    lines.push(`${prefix}cache_hit_rate ${metrics.cache.hitRate.toFixed(2)}`);

    lines.push(`# HELP ${prefix}cache_size Current cache size (number of items)`);
    lines.push(`# TYPE ${prefix}cache_size gauge`);
    lines.push(`${prefix}cache_size ${metrics.cache.size}`);

    Object.entries(metrics.metrics).forEach(([key, metric]) => {
        const metricName = `${prefix}${key.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        lines.push(`# HELP ${metricName} ${metric.name || key}`);
        lines.push(`# TYPE ${metricName} gauge`);
        lines.push(`${metricName} ${metric.avg || metric.count || 0}`);
    });

    return lines.join('\n') + '\n';
}

// ===== 모듈 내보내기 =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = handler; // 기본 핸들러
    module.exports.handler = handler;
    module.exports.batch = batchHandler; // 배치 핸들러 이름 변경 (vercel.json과 일치)
    module.exports.metrics = metricsHandler; // 메트릭 핸들러 이름 변경 (vercel.json과 일치)
    module.exports.healthCheck = healthCheck;
    module.exports.AllTourismAPI = AllTourismAPI; // 클래스 및 유틸리티 내보내기 (테스트 또는 확장용)
    // ... (다른 유틸리티 클래스들도 필요시 내보낼 수 있음)
} else if (typeof window !== 'undefined') {
    // 브라우저 환경에서는 일반적으로 핸들러를 직접 노출하지 않음
    window.AllTourismAPI = AllTourismAPI;
    // ... (다른 유틸리티 클래스들)
}

// ===== 전역 에러 핸들러 (Node.js 환경에서만) =====
if (hasProcess) {
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        // 프로덕션 환경에서는 즉시 종료하지 않고, 로깅 후 그레이스풀 셧다운 시도 가능
        // process.exit(1); 
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // SIGTERM, SIGINT 핸들러는 서버리스 환경에서는 Vercel이 관리하므로 불필요할 수 있음
    // process.on('SIGTERM', () => { ... });
    // process.on('SIGINT', () => { ... });
}

// ===== API 버전 정보 =====
const API_VERSION = '2.1.1'; // 버전 업데이트
const API_BUILD_DATE = new Date().toISOString();

if (typeof module !== 'undefined' && module.exports) {
    module.exports.VERSION = API_VERSION;
    module.exports.BUILD_DATE = API_BUILD_DATE;
} else if (typeof window !== 'undefined') {
    window.TOURISM_API_VERSION = API_VERSION;
    window.TOURISM_API_BUILD_DATE = API_BUILD_DATE;
}

console.log(`🚀 All Tourism API v${API_VERSION} 로드 완료 (${new Date().toISOString()})`);


