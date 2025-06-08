/*
관광 정보 API 서버리스 함수 (개선 버전)

주요 변경 사항:
- SERVICE_START_TIME, hasProcess 상수 정의 추가
- 로깅 일관성 확보 (Logger 사용)
- 에러 처리 일관성 확보 (ResponseFormatter 사용 및 사용자 정의 에러 개선)
- AllTourismAPI 클래스 내 중복 메서드 선언 제거
- 서버리스 환경에 적합하도록 destroy 호출 방식 변경 (setTimeout 제거)
- HTML Sanitization, URL/좌표 유효성 검사 관련 주석 추가 (라이브러리 사용 권장)
- 기타 코드 가독성 및 안정성 개선
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
            // 추가적인 URL 패턴 검증 (예: 특정 프로토콜만 허용 등) 가능
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
        // Haversine 공식 사용 (간단 버전)
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

    // 이 함수는 사용자가 제공한 코드에 있었으나, 실제 구현은 없었습니다.
    // 필요시 사용자가 직접 구현해야 합니다.
    static addDistanceInfo(items, userLat, userLng, radius) {
        const lat = SafeUtils.safeParseFloat(userLat);
        const lng = SafeUtils.safeParseFloat(userLng);
        const rad = SafeUtils.safeParseFloat(radius);

        if (isNaN(lat) || isNaN(lng)) {
            return items; // 유효한 좌표가 아니면 필터링 없이 반환
        }

        return items.map(item => {
            const itemLat = SafeUtils.safeParseFloat(item.mapy);
            const itemLng = SafeUtils.safeParseFloat(item.mapx);
            if (!isNaN(itemLat) && !isNaN(itemLng)) {
                const distance = this.getDistance(lat, lng, itemLat, itemLng);
                item.distance = distance; // 미터 단위
            }
            return item;
        }).filter(item => {
            if (isNaN(rad) || rad <= 0) return true; // 유효한 반경이 아니면 필터링 안 함
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
        this.i18n = i18n; // i18n 객체 저장

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
                message: this.localizedMessage, // 지역화된 메시지 사용
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

        // 일반 Error 객체 또는 예상치 못한 오류 처리
        const i18n = error.i18n; // 에러 객체에 i18n이 있다면 사용
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

    // 이 함수는 사용자가 제공한 코드에 있었으나, 실제 구현은 없었습니다.
    // 필요시 사용자가 직접 구현해야 합니다.
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
        if (typeof factory !== 'function') {
            throw new Error(`Service factory for '${name}' must be a function`);
        }
        this.services.set(name, factory);
        return this;
    }

    get(name) {
        if (!this.services.has(name)) {
            throw new Error(`Service '${name}' not registered`);
        }

        if (!this.instances.has(name)) {
            const factory = this.services.get(name);
            const instance = factory(this);
            this.instances.set(name, instance);
        }

        return this.instances.get(name);
    }

    has(name) {
        return this.services.has(name);
    }

    initialize() {
        if (this.initialized) return;

        for (const [name, factory] of this.services.entries()) {
            if (!this.instances.has(name)) {
                try {
                    const instance = factory(this);
                    this.instances.set(name, instance);
                } catch (error) {
                    console.error(`Failed to initialize service '${name}':`, error);
                    throw error;
                }
            }
        }

        this.initialized = true;
    }

    destroy() {
        for (const [name, instance] of this.instances.entries()) {
            if (instance && typeof instance.destroy === 'function') {
                try {
                    instance.destroy();
                } catch (error) {
                    console.warn(`Error destroying service '${name}':`, error);
                }
            }
        }

        this.instances.clear();
        this.initialized = false;
    }

    getRegisteredServices() {
        return Array.from(this.services.keys());
    }

    getInstancedServices() {
        return Array.from(this.instances.keys());
    }

    isInitialized() {
        return this.initialized;
    }
}

// ===== 국제화 관리자 =====
class InternationalizationManager {
    constructor() {
        this.currentLanguage = 'ko';
        this.messages = {
            ko: {
                FIELD_REQUIRED: '필수 필드입니다: {field}',
                TYPE_MISMATCH: '타입 불일치: {type} 예상, 실제: {actual}',
                INVALID_FORMAT: '유효하지 않은 형식: {field}',
                MIN_LENGTH_ERROR: '최소 길이 오류: {minLength} 필요, 실제: {actual}',
                MAX_LENGTH_ERROR: '최대 길이 오류: {maxLength} 필요, 실제: {actual}',
                NUMERIC_ERROR: '숫자 형식이어야 합니다: {field}',
                INVALID_RANGE: '유효하지 않은 범위: {field}는 {min}에서 {max} 사이여야 합니다',
                ENUM_ERROR: '유효하지 않은 값: 허용된 값: {values}',
                VALIDATION_ERROR: '입력 유효성 검사 오류',
                VALIDATION_ERROR_FIELD: '필드 \'{field}\' 유효성 검사 오류: {message}',
                UNSUPPORTED_OPERATION: '지원하지 않는 작업: {operation}',
                INVALID_COORDINATES: '유효하지 않은 좌표: 위도={lat}, 경도={lng}',
                INVALID_RANGE: '{field}의 값이 유효하지 않습니다. {min}에서 {max} 사이여야 합니다.',
                API_ERROR: 'API 오류가 발생했습니다',
                API_TIMEOUT: 'API 요청이 {timeout}ms 후 시간 초과되었습니다 (작업: {operation})',
                RATE_LIMIT_EXCEEDED: '요청 한도를 초과했습니다. 한도: {limit}, 남은 요청: {remaining}',
                SECURITY_ERROR: '보안 위협이 감지되었습니다',
                UNKNOWN_ERROR: '예상치 못한 오류가 발생했습니다',
                MISSING_API_KEY: 'API 키가 설정되지 않았습니다',
                NOT_FOUND: '요청한 리소스를 찾을 수 없습니다',
                BATCH_SIZE_EXCEEDED: '배치 크기 초과: 최대 {max}개, 실제: {actual}개',
                BATCH_DISABLED: '배치 처리가 비활성화되었습니다'
            },
            en: {
                FIELD_REQUIRED: 'Field is required: {field}',
                TYPE_MISMATCH: 'Type mismatch: expected {type}, got {actual}',
                INVALID_FORMAT: 'Invalid format: {field}',
                MIN_LENGTH_ERROR: 'Minimum length error: required {minLength}, got {actual}',
                MAX_LENGTH_ERROR: 'Maximum length error: required {maxLength}, got {actual}',
                NUMERIC_ERROR: 'Must be numeric: {field}',
                INVALID_RANGE: 'Invalid range: {field} must be between {min} and {max}',
                ENUM_ERROR: 'Invalid value: allowed values: {values}',
                VALIDATION_ERROR: 'Input validation error',
                VALIDATION_ERROR_FIELD: 'Validation error for field \'{field}\': {message}',
                UNSUPPORTED_OPERATION: 'Unsupported operation: {operation}',
                INVALID_COORDINATES: 'Invalid coordinates: lat={lat}, lng={lng}',
                INVALID_RANGE: 'Invalid value for {field}. Must be between {min} and {max}.',
                API_ERROR: 'An API error occurred',
                API_TIMEOUT: 'API request timed out after {timeout}ms (operation: {operation})',
                RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Limit: {limit}, Remaining: {remaining}',
                SECURITY_ERROR: 'Security threat detected',
                UNKNOWN_ERROR: 'An unexpected error occurred',
                MISSING_API_KEY: 'API key is not configured',
                NOT_FOUND: 'The requested resource was not found',
                BATCH_SIZE_EXCEEDED: 'Batch size exceeded: max {max}, got {actual}',
                BATCH_DISABLED: 'Batch processing is disabled'
            }
        };
    }

    getMessage(key, params = {}) {
        const messages = this.messages[this.currentLanguage] || this.messages.en;
        let message = messages[key] || key;

        if (params) {
            Object.entries(params).forEach(([param, value]) => {
                message = message.replace(new RegExp(`{${param}}`, 'g'), value);
            });
        }

        return message;
    }

    setLanguage(language) {
        if (this.messages[language]) {
            this.currentLanguage = language;
            return true;
        }
        return false;
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }

    getSupportedLanguages() {
        return Object.keys(this.messages);
    }

    setLanguageFromHeader(acceptLanguageHeader) {
        if (!acceptLanguageHeader) return false;

        const languages = acceptLanguageHeader
            .split(',')
            .map(lang => {
                const [code, q = 'q=1.0'] = lang.trim().split(';');
                const quality = parseFloat(q.split('=')[1]) || 0;
                return { code: code.split('-')[0], quality };
            })
            .sort((a, b) => b.quality - a.quality);

        for (const lang of languages) {
            if (this.setLanguage(lang.code)) {
                return true;
            }
        }

        return false;
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
            '28': { ko: '레포츠', en: 'Leisure Sports' },
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
}

// ===== 설정 관리자 =====
class ConfigManager {
    constructor(container) {
        this.container = container;
        this.config = {
            version: '2.1.0',
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
        const { apiKey, ...publicConfig } = this.getAll();
        return {
            ...publicConfig,
            hasApiKey: !!apiKey
        };
    }

    hasValidApiKey() {
        return !!this.config.apiKey && this.config.apiKey.length > 10;
    }

    validateConfig() {
        const logger = this.container.get('logger');
        const errors = [];

        if (!this.hasValidApiKey()) {
            const error = 'API 키가 설정되지 않았거나 유효하지 않습니다';
            errors.push(error);
            logger.warn(error);
        }

        if (this.config.cacheTTL <= 0) {
            const error = '캐시 TTL은 양수여야 합니다';
            errors.push(error);
            logger.warn(error);
        }

        if (this.config.rateLimit <= 0) {
            const error = '요청 한도는 양수여야 합니다';
            errors.push(error);
            logger.warn(error);
        }

        if (errors.length > 0) {
            // 에러를 로깅하지만 예외는 발생시키지 않음 (경고로 처리)
            logger.warn('설정 유효성 검사 경고', { errors });
            return false;
        }

        return true;
    }
}

// ===== 로거 =====
class Logger {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.metrics = {};
        this.startTime = Date.now();
    }

    _formatMessage(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const environment = this.config.get('environment');
        const logFormat = this.config.get('logFormat');

        if (logFormat === 'json') {
            return JSON.stringify({
                timestamp,
                level,
                message,
                environment,
                ...data
            });
        } else {
            let dataStr = '';
            if (Object.keys(data).length > 0) {
                try {
                    dataStr = JSON.stringify(data);
                } catch (e) {
                    dataStr = `[데이터 직렬화 오류: ${e.message}]`;
                }
            }
            return `[${timestamp}] [${level.toUpperCase()}] [${environment}] ${message} ${dataStr}`;
        }
    }

    _shouldLog(level) {
        const levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };

        const configLevel = this.config.get('logLevel') || 'info';
        return levels[level] >= levels[configLevel];
    }

    _log(level, message, data = {}) {
        if (!this._shouldLog(level)) return;

        const formattedMessage = this._formatMessage(level, message, data);

        if (this.config.get('logToConsole')) {
            switch (level) {
                case 'debug':
                    console.debug(formattedMessage);
                    break;
                case 'info':
                    console.info(formattedMessage);
                    break;
                case 'warn':
                    console.warn(formattedMessage);
                    break;
                case 'error':
                    console.error(formattedMessage);
                    break;
                default:
                    console.log(formattedMessage);
            }
        }

        // 파일 로깅 구현은 생략 (필요시 추가)
    }

    debug(message, data = {}) {
        this._log('debug', message, data);
    }

    info(message, data = {}) {
        this._log('info', message, data);
    }

    warn(message, data = {}) {
        this._log('warn', message, data);
    }

    error(message, data = {}) {
        this._log('error', message, data);
    }

    metric(name, value = 1, tags = {}) {
        if (!this.config.get('metricsEnabled')) return;

        if (!this.metrics[name]) {
            this.metrics[name] = {
                name,
                count: 0,
                sum: 0,
                min: Number.MAX_VALUE,
                max: Number.MIN_VALUE,
                avg: 0,
                tags: []
            };
        }

        const metric = this.metrics[name];
        metric.count += 1;
        metric.sum += value;
        metric.min = Math.min(metric.min, value);
        metric.max = Math.max(metric.max, value);
        metric.avg = metric.sum / metric.count;

        if (Object.keys(tags).length > 0) {
            metric.tags.push({ ...tags, timestamp: Date.now() });
            // 태그 배열 크기 제한
            if (metric.tags.length > 100) {
                metric.tags = metric.tags.slice(-100);
            }
        }
    }

    getMetrics() {
        return { ...this.metrics };
    }

    getMemoryInfo() {
        if (hasProcess && process.memoryUsage) {
            const memoryUsage = process.memoryUsage();
            return {
                rss: memoryUsage.rss,
                heapTotal: memoryUsage.heapTotal,
                heapUsed: memoryUsage.heapUsed,
                external: memoryUsage.external,
                arrayBuffers: memoryUsage.arrayBuffers
            };
        }
        return {
            uptime: Date.now() - this.startTime
        };
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

        // API 키 기반 제한 (실제 구현에서는 API 키별로 다른 제한을 적용할 수 있음)
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
            throw new TourismApiError(
                'MISSING_API_KEY',
                operation,
                500,
                { requestId },
                {},
                this.container.get('i18n')
            );
        }

        const url = new URL(`${baseUrl}/${operation}`);

        // 기본 파라미터 추가
        const defaultParams = {
            ServiceKey: apiKey,
            MobileOS: 'ETC',
            MobileApp: 'TourismAPI',
            _type: 'json',
            ...this.constants.API_SETTINGS.defaultParams
        };

        // URL 파라미터 설정
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
                // Node.js 환경에서 fetch가 없는 경우 (Node.js 17 이전 버전)
                const http = await import('http');
                const https = await import('https');

                response = await new Promise((resolve, reject) => {
                    const client = url.protocol === 'https:' ? https : http;
                    const req = client.get(url, (res) => {
                        let data = '';
                        res.on('data', (chunk) => {
                            data += chunk;
                        });
                        res.on('end', () => {
                            resolve({
                                ok: res.statusCode >= 200 && res.statusCode < 300,
                                status: res.statusCode,
                                statusText: res.statusMessage,
                                json: () => Promise.resolve(JSON.parse(data))
                            });
                        });
                    });
                    req.on('error', reject);
                    req.end();
                });
            } else {
                // fetch가 있는 환경 (브라우저 또는 최신 Node.js)
                response = await fetch(url.toString());
            }

            if (!response.ok) {
                throw new TourismApiError(
                    'API_ERROR',
                    operation,
                    response.status,
                    {
                        status: response.status,
                        statusText: response.statusText
                    },
                    { requestId },
                    this.container.get('i18n')
                );
            }

            const data = await response.json();
            const responseTime = Date.now() - startTime;

            // 응답 코드 확인
            const resultCode = data.response?.header?.resultCode;
            if (resultCode !== '0000') {
                throw new TourismApiError(
                    'API_ERROR',
                    operation,
                    500,
                    {
                        resultCode,
                        resultMsg: data.response?.header?.resultMsg
                    },
                    { requestId },
                    this.container.get('i18n')
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

            if (error instanceof TourismApiError) {
                throw error;
            }

            this.logger.error('API 요청 실패', {
                requestId,
                operation,
                error: error.message,
                responseTime
            });

            throw new TourismApiError(
                'API_ERROR',
                operation,
                500,
                {
                    originalError: error.message
                },
                { requestId },
                this.container.get('i18n')
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
                overview: SafeUtils.sanitizeInput(item.overview, 1000, {
                    allowedTags: ['br', 'p', 'a', 'strong', 'em', 'ul', 'ol', 'li']
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
            console.warn('Error processing basic item:', error);
            return null;
        }
    }

    static sanitizeHtml(input) {
        if (!input || typeof input !== 'string') return input;

        // 기본적인 HTML 태그 제거 및 엔티티 디코딩
        // 참고: 실제 프로덕션 환경에서는 DOMPurify 또는 sanitize-html 같은 라이브러리 사용 권장
        return input
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, '/')
            .trim();
    }

    static validateImageUrl(url) {
        if (!url || typeof url !== 'string') return null;

        // URL 프로토콜 검사
        if (!url.startsWith('http://') && !url.startsWith('https://')) return null;

        // URL 구문 유효성 검사
        try {
            new URL(url);
        } catch {
            return null;
        }

        // 이미지 확장자 검사
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        const hasValidExtension = imageExtensions.some(ext =>
            url.toLowerCase().endsWith(ext)
        );

        return hasValidExtension ? url : null;
    }

    static sanitizeCoordinate(coord) {
        if (!coord) return null;
        const num = SafeUtils.safeParseFloat(coord);
        if (isNaN(num)) return null;
        if (Math.abs(num) > 180) return null;
        return num;
    }

    static formatDate(dateString) {
        if (!dateString) return null;

        try {
            if (/^\d{14}$/.test(dateString)) {
                const year = parseInt(dateString.substring(0, 4));
                const month = parseInt(dateString.substring(4, 6));
                const day = parseInt(dateString.substring(6, 8));
                const hour = parseInt(dateString.substring(8, 10));
                const minute = parseInt(dateString.substring(10, 12));
                const second = parseInt(dateString.substring(12, 14));

                if (!this.isValidDateTime(year, month, day, hour, minute, second)) {
                    return null;
                }

                return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
            }

            if (/^\d{8}$/.test(dateString)) {
                const year = parseInt(dateString.substring(0, 4));
                const month = parseInt(dateString.substring(4, 6));
                const day = parseInt(dateString.substring(6, 8));

                if (!this.isValidDate(year, month, day)) {
                    return null;
                }

                return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
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
        if (year < 1900 || year > 2100) return false;
        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;

        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year &&
               date.getMonth() === month - 1 &&
               date.getDate() === day &&
               !isNaN(date.getTime());
    }

    static isValidDateTime(year, month, day, hour, minute, second) {
        if (!this.isValidDate(year, month, day)) return false;
        if (hour < 0 || hour > 23) return false;
        if (minute < 0 || minute > 59) return false;
        if (second < 0 || second > 59) return false;

        const date = new Date(year, month - 1, day, hour, minute, second);
        return date.getFullYear() === year &&
               date.getMonth() === month - 1 &&
               date.getDate() === day &&
               date.getHours() === hour &&
               date.getMinutes() === minute &&
               date.getSeconds() === second &&
               !isNaN(date.getTime());
    }

    static calculateCompleteness(item) {
        const fields = [
            'title', 'addr1', 'tel', 'firstimage', 'mapx', 'mapy',
            'overview', 'homepage', 'cat1', 'cat2', 'cat3'
        ];

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
                cpyrhtDivCd: item.cpyrhtDivCd,
                serialnum: item.serialnum,
                meta: {
                    hasOriginal: !!item.originimgurl,
                    hasSmall: !!item.smallimageurl,
                    hasCopyright: !!item.cpyrhtDivCd
                }
            };
        } catch (error) {
            console.warn('Error processing image item:', error);
            return null;
        }
    }

    static processCodeItem(item) {
        if (!item) return null;

        return {
            code: item.code,
            name: item.name,
            rnum: item.rnum
        };
    }
}


// ===== 고급 입력 검증기 =====
class InputValidator {
    constructor(container) {
        this.container = container;
        this.i18n = container.get('i18n');
        this.logger = container.get('logger');
        this.schemas = new Map();
        this.customValidators = new Map();
        this._destroyed = false;

        this.setupSchemas();
        this.registerCustomValidators();
    }

    setupSchemas() {
        const commonSchema = {
            numOfRows: {
                type: 'string',
                pattern: /^\d+$/,
                min: 1,
                max: 1000,
                sanitize: true,
                transform: (value) => String(SafeUtils.safeParseInt(value, 10))
            },
            pageNo: {
                type: 'string',
                pattern: /^\d+$/,
                min: 1,
                max: 1000,
                sanitize: true,
                transform: (value) => String(SafeUtils.safeParseInt(value, 1))
            },
            arrange: {
                type: 'string',
                enum: ['A', 'B', 'C', 'D', 'E', 'O', 'Q', 'R'],
                sanitize: true,
                default: 'A'
            }
        };

        const locationSchema = {
            userLat: {
                type: 'string',
                // 좌표 패턴 문법 수정: 소수점 이하 숫자가 있을 수도 있고 없을 수도 있음
                pattern: /^-?\d+(\.\d+)?$/,
                custom: 'latitude',
                sanitize: true
            },
            userLng: {
                type: 'string',
                // 좌표 패턴 문법 수정: 소수점 이하 숫자가 있을 수도 있고 없을 수도 있음
                pattern: /^-?\d+(\.\d+)?$/,
                custom: 'longitude',
                sanitize: true
            },
            radius: {
                type: 'string',
                pattern: /^\d+(\.\d+)?$/,
                min: 0.1,
                max: 20000,
                sanitize: true
            }
        };

        this.schemas.set('areaBasedList', {
            ...commonSchema,
            ...locationSchema,
            contentTypeId: {
                type: 'string',
                enum: ['12', '14', '15', '25', '28', '32', '38', '39'],
                sanitize: true
            },
            areaCode: {
                type: 'string',
                pattern: /^\d{1,2}$/,
                custom: 'areaCode',
                sanitize: true
            },
            sigunguCode: {
                type: 'string',
                pattern: /^\d{1,5}$/,
                sanitize: true
            },
            cat1: {
                type: 'string',
                pattern: /^[A-Z]\d{2}$/,
                sanitize: true
            },
            cat2: {
                type: 'string',
                pattern: /^[A-Z]\d{4}$/,
                sanitize: true
            },
            cat3: {
                type: 'string',
                pattern: /^[A-Z]\d{6}$/,
                sanitize: true
            },
            modifiedtime: {
                type: 'string',
                pattern: /^\d{8}$/,
                custom: 'dateFormat',
                sanitize: true
            }
        });

        this.schemas.set('detailCommon', {
            contentId: {
                type: 'string',
                required: true,
                pattern: /^\d+$/,
                custom: 'contentId',
                sanitize: true
            },
            defaultYN: {
                type: 'string',
                enum: ['Y', 'N'],
                default: 'Y'
            },
            firstImageYN: {
                type: 'string',
                enum: ['Y', 'N'],
                default: 'Y'
            },
            areacodeYN: {
                type: 'string',
                enum: ['Y', 'N'],
                default: 'Y'
            },
            catcodeYN: {
                type: 'string',
                enum: ['Y', 'N'],
                default: 'Y'
            },
            addrinfoYN: {
                type: 'string',
                enum: ['Y', 'N'],
                default: 'Y'
            },
            mapinfoYN: {
                type: 'string',
                enum: ['Y', 'N'],
                default: 'Y'
            },
            overviewYN: {
                type: 'string',
                enum: ['Y', 'N'],
                default: 'Y'
            }
        });

        this.schemas.set('searchKeyword', {
            ...commonSchema,
            ...locationSchema,
            keyword: {
                type: 'string',
                required: true,
                minLength: 1,
                maxLength: 100,
                custom: 'keyword',
                sanitize: true
            },
            contentTypeId: {
                type: 'string',
                enum: ['12', '14', '15', '25', '28', '32', '38', '39'],
                sanitize: true
            },
            areaCode: {
                type: 'string',
                pattern: /^\d{1,2}$/,
                custom: 'areaCode',
                sanitize: true
            },
            sigunguCode: {
                type: 'string',
                pattern: /^\d{1,5}$/,
                sanitize: true
            }
        });

        this.setupDetailSchemas();
        this.setupLocationSchemas();
        this.setupCodeSchemas();
    }

    setupDetailSchemas() {
        this.schemas.set('detailIntro', {
            contentId: {
                type: 'string',
                required: true,
                pattern: /^\d+$/,
                custom: 'contentId',
                sanitize: true
            },
            contentTypeId: {
                type: 'string',
                required: true,
                enum: ['12', '14', '15', '25', '28', '32', '38', '39'],
                sanitize: true
            }
        });

        this.schemas.set('detailInfo', {
            contentId: {
                type: 'string',
                required: true,
                pattern: /^\d+$/,
                custom: 'contentId',
                sanitize: true
            },
            contentTypeId: {
                type: 'string',
                required: true,
                enum: ['12', '14', '15', '25', '28', '32', '38', '39'],
                sanitize: true
            }
        });

        this.schemas.set('detailImage', {
            contentId: {
                type: 'string',
                required: true,
                pattern: /^\d+$/,
                custom: 'contentId',
                sanitize: true
            },
            imageYN: {
                type: 'string',
                enum: ['Y', 'N'],
                default: 'Y'
            },
            subImageYN: {
                type: 'string',
                enum: ['Y', 'N'],
                default: 'Y'
            }
        });
    }

    setupLocationSchemas() {
        this.schemas.set('locationBasedList', {
            mapX: {
                type: 'string',
                required: true,
                pattern: /^-?\d+(\.\d+)?$/,
                custom: 'longitude',
                sanitize: true
            },
            mapY: {
                type: 'string',
                required: true,
                pattern: /^-?\d+(\.\d+)?$/,
                custom: 'latitude',
                sanitize: true
            },
            radius: {
                type: 'string',
                pattern: /^\d+$/,
                min: 1,
                max: 20000,
                default: '1000'
            },
            numOfRows: {
                type: 'string',
                pattern: /^\d+$/,
                min: 1,
                max: 1000,
                default: '10'
            },
            pageNo: {
                type: 'string',
                pattern: /^\d+$/,
                min: 1,
                default: '1'
            },
            arrange: {
                type: 'string',
                enum: ['A', 'B', 'C', 'D', 'E'],
                default: 'A'
            },
            contentTypeId: {
                type: 'string',
                enum: ['12', '14', '15', '25', '28', '32', '38', '39'],
                sanitize: true
            }
        });

        this.schemas.set('searchFestival', {
            numOfRows: {
                type: 'string',
                pattern: /^\d+$/,
                min: 1,
                max: 1000,
                default: '10'
            },
            pageNo: {
                type: 'string',
                pattern: /^\d+$/,
                min: 1,
                default: '1'
            },
            arrange: {
                type: 'string',
                enum: ['A', 'B', 'C', 'D', 'E', 'O', 'Q', 'R'],
                default: 'A'
            },
            eventStartDate: {
                type: 'string',
                pattern: /^\d{8}$/,
                custom: 'dateFormat',
                sanitize: true
            },
            eventEndDate: {
                type: 'string',
                pattern: /^\d{8}$/,
                custom: 'dateFormat',
                sanitize: true
            },
            areaCode: {
                type: 'string',
                pattern: /^\d{1,2}$/,
                custom: 'areaCode',
                sanitize: true
            },
            sigunguCode: {
                type: 'string',
                pattern: /^\d{1,5}$/,
                sanitize: true
            }
        });
    }

    setupCodeSchemas() {
        this.schemas.set('areaCode', {
            areaCode: {
                type: 'string',
                pattern: /^\d{1,2}$/,
                custom: 'areaCode',
                sanitize: true
            },
            numOfRows: {
                type: 'string',
                pattern: /^\d+$/,
                min: 1,
                max: 1000,
                default: '100'
            },
            pageNo: {
                type: 'string',
                pattern: /^\d+$/,
                min: 1,
                default: '1'
            }
        });

        this.schemas.set('categoryCode', {
            contentTypeId: {
                type: 'string',
                enum: ['12', '14', '15', '25', '28', '32', '38', '39'],
                sanitize: true
            },
            cat1: {
                type: 'string',
                pattern: /^[A-Z]\d{2}$/,
                sanitize: true
            },
            cat2: {
                type: 'string',
                pattern: /^[A-Z]\d{4}$/,
                sanitize: true
            },
            numOfRows: {
                type: 'string',
                pattern: /^\d+$/,
                min: 1,
                max: 1000,
                default: '100'
            },
            pageNo: {
                type: 'string',
                pattern: /^\d+$/,
                min: 1,
                default: '1'
            }
        });
    }

    registerCustomValidators() {
        this.customValidators.set('latitude', (value) => {
            const num = SafeUtils.safeParseFloat(value);
            if (isNaN(num)) return false;
            return num >= -90 && num <= 90;
        });

        this.customValidators.set('longitude', (value) => {
            const num = SafeUtils.safeParseFloat(value);
            if (isNaN(num)) return false;
            return num >= -180 && num <= 180;
        });

        this.customValidators.set('areaCode', (value) => {
            const validAreaCodes = ['1', '2', '3', '4', '5', '6', '7', '8', '31', '32', '33', '34', '35', '36', '37', '38', '39'];
            return validAreaCodes.includes(value);
        });

        this.customValidators.set('contentId', (value) => {
            const num = SafeUtils.safeParseInt(value);
            return !isNaN(num) && num > 0 && num <= 999999999;
        });

        this.customValidators.set('keyword', (value) => {
            if (typeof value !== 'string') return false;
            const trimmed = value.trim();

            if (trimmed.length === 0 || trimmed.length > 100) return false;

            // 위험한 패턴 검사 (XSS, SQL 인젝션 등)
            const dangerousPatterns = [
                /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
                /javascript\s*:/gi,
                /on\w+\s*=/gi,
                /eval\s*\(/gi,
                /expression\s*\(/gi,
                /<iframe/gi,
                /<object/gi,
                /<embed/gi,
                /(\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b|\bunion\b)/gi,
                /('|(\\x27)|(\\x2D\\x2D)|(%27)|(%2D%2D))/gi,
                /((\%3D)|(=))[^\n]*?((\%27)|(\\x27)|(')|(\-\-)|(\%3B)|(;))/gi
            ];

            for (const pattern of dangerousPatterns) {
                if (pattern.test(trimmed)) return false;
            }

            return true;
        });

        this.customValidators.set('dateFormat', (value) => {
            if (!/^\d{8}$/.test(value)) return false;

            const year = parseInt(value.substring(0, 4));
            const month = parseInt(value.substring(4, 6));
            const day = parseInt(value.substring(6, 8));

            if (year < 1900 || year > 2100) return false;
            if (month < 1 || month > 12) return false;
            if (day < 1 || day > 31) return false;

            try {
                const date = new Date(year, month - 1, day);
                return date.getFullYear() === year &&
                       date.getMonth() === month - 1 &&
                       date.getDate() === day;
            } catch {
                return false;
            }
        });

        this.customValidators.set('url', (value) => {
            return SafeUtils.isValidUrl(value);
        });
    }

    validate(operation, params) {
        if (this._destroyed) {
            throw new ValidationError(
                'Validator has been destroyed',
                'system',
                'destroyed',
                this.i18n
            );
        }

        try {
            const schema = this.schemas.get(operation);
            if (!schema) {
                throw new ValidationError(
                    this.i18n.getMessage('UNSUPPORTED_OPERATION', { operation }),
                    'operation',
                    operation,
                    this.i18n
                );
            }

            const errors = [];
            const sanitizedParams = {};

            for (const [field, rules] of Object.entries(schema)) {
                const result = this.validateField(field, params[field], rules);

                if (result.errors.length > 0) {
                    errors.push(...result.errors);
                } else if (result.value !== undefined) {
                    sanitizedParams[field] = result.value;
                }
            }

            this.validateBusinessLogic(operation, sanitizedParams, errors);

            if (errors.length > 0) {
                throw new ValidationError(
                    `${this.i18n.getMessage('VALIDATION_ERROR')}: ${errors.join(', ')}`,
                    'validation',
                    params,
                    this.i18n
                );
            }

            return sanitizedParams;
        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }

            this.logger.error('Validation system error', {
                error: error.message,
                operation
            });

            throw new ValidationError(
                'Validation system error',
                'system',
                operation,
                this.i18n
            );
        }
    }

    validateField(field, value, rules) {
        const result = { errors: [], value: undefined };

        try {
            if ((value === undefined || value === null || value === '') && rules.default) {
                value = rules.default;
            }

            if (rules.required && (value === undefined || value === null || value === '')) {
                result.errors.push(`${field}: ${this.i18n.getMessage('FIELD_REQUIRED', { field })}`);
                return result;
            }

            if (value === undefined || value === null || value === '') {
                return result;
            }

            let sanitizedValue = value;
            if (rules.sanitize && typeof value === 'string') {
                sanitizedValue = SafeUtils.sanitizeInput(value, rules.maxLength || 1000);
            }

            if (rules.transform && typeof rules.transform === 'function') {
                sanitizedValue = rules.transform(sanitizedValue);
            }

            if (rules.type && typeof sanitizedValue !== rules.type) {
                result.errors.push(`${field}: ${this.i18n.getMessage('TYPE_MISMATCH', {
                    type: rules.type,
                    actual: typeof sanitizedValue
                })}`);
                return result;
            }

            if (rules.pattern && typeof sanitizedValue === 'string' && !rules.pattern.test(sanitizedValue)) {
                result.errors.push(`${field}: ${this.i18n.getMessage('INVALID_FORMAT', { field })}`);
                return result;
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
                error: error.message
            });
            result.errors.push(`${field}: validation failed`);
            return result;
        }
    }

    validateBusinessLogic(operation, params, errors) {
        try {
            if (operation === 'searchFestival' && params.eventStartDate && params.eventEndDate) {
                const startDateNum = SafeUtils.safeParseInt(params.eventStartDate);
                const endDateNum = SafeUtils.safeParseInt(params.eventEndDate);

                if (startDateNum > endDateNum) {
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
                error: error.message
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
                    memory: logger.getMemoryInfo()
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
                error: error.message,
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

            // 사용자 좌표가 제공된 경우 거리 정보 추가
            let itemsWithDistance = processedItems;
            if (validatedParams.userLat && validatedParams.userLng) {
                itemsWithDistance = GeoUtils.addDistanceInfo(
                    processedItems,
                    validatedParams.userLat,
                    validatedParams.userLng,
                    validatedParams.radius
                );
            }

            const result = ResponseFormatter.formatSuccess('areaBasedList', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                items: itemsWithDistance
            });

            cache.set(cacheKey, result);
            logger.info('areaBasedList 요청 완료', {
                requestId,
                itemCount: itemsWithDistance.length
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
            const processedItem = items.length > 0
                ? ApiResponseProcessor.processBasicItem(items[0], this.container)
                : null;

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
            const processedItem = items.length > 0 ? items[0] : null;

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

            const result = ResponseFormatter.formatSuccess('detailInfo', {
                totalCount: items.length,
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
                totalCount: processedItems.length,
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

            // 사용자 좌표가 제공된 경우 거리 정보 추가
            let itemsWithDistance = processedItems;
            if (validatedParams.userLat && validatedParams.userLng) {
                itemsWithDistance = GeoUtils.addDistanceInfo(
                    processedItems,
                    validatedParams.userLat,
                    validatedParams.userLng,
                    validatedParams.radius
                );
            }

            const result = ResponseFormatter.formatSuccess('searchKeyword', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                keyword: validatedParams.keyword,
                items: itemsWithDistance
            });

            cache.set(cacheKey, result);
            logger.info('searchKeyword 요청 완료', {
                requestId,
                keyword: validatedParams.keyword,
                itemCount: itemsWithDistance.length
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
                _type: 'json',
                contentTypeId: '15' // 축제/공연/행사
            };

            const data = await httpClient.getTourismData('searchFestival1', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ApiResponseProcessor.processBasicItem(item, this.container))
                .filter(Boolean);

            const result = ResponseFormatter.formatSuccess('searchFestival', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                eventStartDate: validatedParams.eventStartDate,
                eventEndDate: validatedParams.eventEndDate,
                items: processedItems
            });

            cache.set(cacheKey, result);
            logger.info('searchFestival 요청 완료', {
                requestId,
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

            // 거리 정보 추가
            const itemsWithDistance = GeoUtils.addDistanceInfo(
                processedItems,
                validatedParams.mapY, // API에서는 mapY가 위도(latitude)
                validatedParams.mapX, // API에서는 mapX가 경도(longitude)
                validatedParams.radius
            );

            const result = ResponseFormatter.formatSuccess('locationBasedList', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                mapX: validatedParams.mapX,
                mapY: validatedParams.mapY,
                radius: validatedParams.radius,
                items: itemsWithDistance
            });

            cache.set(cacheKey, result);
            logger.info('locationBasedList 요청 완료', {
                requestId,
                itemCount: itemsWithDistance.length
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

            // 지역 코드는 장기간 캐싱 (24시간)
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

            // 카테고리 코드는 장기간 캐싱 (24시간)
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

            // 배치 요청 처리
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
                    switch (operation) {
                        case 'areaBasedList':
                            result = await this.areaBasedList(params);
                            break;
                        case 'detailCommon':
                            result = await this.detailCommon(params);
                            break;
                        case 'detailIntro':
                            result = await this.detailIntro(params);
                            break;
                        case 'detailInfo':
                            result = await this.detailInfo(params);
                            break;
                        case 'detailImage':
                            result = await this.detailImage(params);
                            break;
                        case 'searchKeyword':
                            result = await this.searchKeyword(params);
                            break;
                        case 'searchFestival':
                            result = await this.searchFestival(params);
                            break;
                        case 'locationBasedList':
                            result = await this.locationBasedList(params);
                            break;
                        case 'areaCode':
                            result = await this.areaCode(params);
                            break;
                        case 'categoryCode':
                            result = await this.categoryCode(params);
                            break;
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
                        params,
                        result
                    });

                } catch (error) {
                    logger.error('배치 작업 오류', {
                        requestId,
                        operation,
                        error: error.message,
                        index: i
                    });

                    errors.push({
                        index: i,
                        success: false,
                        operation,
                        params,
                        error: {
                            code: error.code || 'UNKNOWN_ERROR',
                            message: error.message || '알 수 없는 오류',
                            statusCode: error.statusCode || 500
                        }
                    });
                }

                // 요청 간 짧은 지연 추가
                if (i < operations.length - 1) {
                    await SafeUtils.sleep(50);
                }
            }

            const successCount = results.length;
            const errorCount = errors.length;

            logger.info('배치 요청 완료', {
                requestId,
                total: operations.length,
                successful: successCount,
                failed: errorCount
            });

            return ResponseFormatter.formatSuccess('batch', {
                results: [...results, ...errors].sort((a, b) => a.index - b.index),
                summary: {
                    total: operations.length,
                    successful: successCount,
                    failed: errorCount,
                    successRate: ((successCount / operations.length) * 100).toFixed(2) + '%'
                }
            });

        } catch (error) {
            logger.error('배치 요청 오류', {
                requestId,
                error: error.message
            });

            return ResponseFormatter.formatError(error, 'batch');
        }
    }

    destroy() {
        try {
            const logger = this.container.get('logger');
            logger.info('AllTourismAPI 인스턴스 정리 시작');

            this.container.destroy();

            return {
                success: true,
                message: 'API 인스턴스가 성공적으로 정리되었습니다'
            };
        } catch (error) {
            console.error('API 인스턴스 정리 중 오류:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}


// ===== CORS 헤더 설정 =====
function setCorsHeaders(res) {
    const allowedOrigins = (hasProcess && process.env.ALLOWED_ORIGINS) ?
        process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) :
        ['*'];

    const allowAllOrigins = allowedOrigins[0] === '*';
    res.setHeader(
        'Access-Control-Allow-Origin',
        allowAllOrigins ? '*' : allowedOrigins.join(',')
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Accept, Accept-Language'
    );
    res.setHeader('Access-Control-Max-Age', '86400');

    if (!allowAllOrigins) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
        res.setHeader('Access-Control-Allow-Credentials', 'false');
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
}

// ===== 헬스체크 함수 =====
async function healthCheck() {
    let api;
    try {
        api = new AllTourismAPI();
        const status = api.getSystemStatus();

        const result = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.1.0',
            uptime: Date.now() - SERVICE_START_TIME,
            environment: hasProcess ? process.env.NODE_ENV || 'development' : 'browser',
            apiKeyConfigured: !!(hasProcess && process.env.TOURISM_API_KEY),
            services: status.system?.isInitialized || false,
            ...status.system
        };

        return result;
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
            version: '2.1.0'
        };
    } finally {
        if (api) {
            try {
                api.destroy();
            } catch (destroyError) {
                console.warn('Health check cleanup warning:', destroyError);
            }
        }
    }
}

// ===== 메인 서버리스 함수 핸들러 =====
async function handler(req, res) {
    const requestId = SafeUtils.generateRequestId();
    const startTime = Date.now();
    let api = null;

    try {
        setCorsHeaders(res);

        if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
        }

        if (!hasProcess || !process.env.TOURISM_API_KEY) {
            throw new TourismApiError(
                'MISSING_API_KEY',
                'configuration',
                500,
                {
                    requestId,
                    message: 'TOURISM_API_KEY 환경변수가 설정되지 않았습니다'
                }
            );
        }

        api = new AllTourismAPI();
        const configManager = api.container.get('config');
        const i18n = api.container.get('i18n');
        const logger = api.container.get('logger');

        logger.info('요청 수신', {
            requestId,
            method: req.method,
            userAgent: req.headers['user-agent'],
            origin: req.headers.origin
        });

        if (req.headers['accept-language']) {
            i18n.setLanguageFromHeader(req.headers['accept-language']);
        }

        let params = {};
        try {
            if (req.method === 'GET') {
                params = req.query || {};
            } else if (req.method === 'POST') {
                const contentType = req.headers['content-type'] || '';
                if (!contentType.includes('application/json') &&
                    !contentType.includes('application/x-www-form-urlencoded')) {
                    throw new ValidationError(
                        '지원하지 않는 Content-Type입니다. application/json 또는 application/x-www-form-urlencoded를 사용해주세요.',
                        'contentType',
                        contentType,
                        i18n
                    );
                }
                params = req.body || {};
            } else {
                throw new ValidationError(
                    '지원하지 않는 HTTP 메서드입니다',
                    'method',
                    req.method,
                    i18n
                );
            }
        } catch (parseError) {
            throw new ValidationError(
                '요청 데이터 파싱 실패',
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
                    version: '2.1.0',
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
                version: '2.1.0',
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
                version: '2.1.0'
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
                version: '2.1.0'
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
            case 'areaBasedList':
                result = await api.areaBasedList(apiParams);
                break;
            case 'detailCommon':
                result = await api.detailCommon(apiParams);
                break;
            case 'detailIntro':
                result = await api.detailIntro(apiParams);
                break;
            case 'detailInfo':
                result = await api.detailInfo(apiParams);
                break;
            case 'detailImage':
                result = await api.detailImage(apiParams);
                break;
            case 'searchKeyword':
                result = await api.searchKeyword(apiParams);
                break;
            case 'searchFestival':
                result = await api.searchFestival(apiParams);
                break;
            case 'locationBasedList':
                result = await api.locationBasedList(apiParams);
                break;
            case 'areaCode':
                result = await api.areaCode(apiParams);
                break;
            case 'categoryCode':
                result = await api.categoryCode(apiParams);
                break;
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
            version: '2.1.0',
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
        console.error('Handler Error:', error);

        const errorResponse = ResponseFormatter.formatError(error, error.operation || 'unknown');

        if (!errorResponse.metadata) {
            errorResponse.metadata = {};
        }

        errorResponse.metadata = {
            ...errorResponse.metadata,
            requestId,
            totalTime: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            version: '2.1.0',
            environment: hasProcess ? process.env.NODE_ENV || 'development' : 'unknown'
        };

        const statusCode = error.statusCode || 500;

        if (api) {
            try {
                const logger = api.container.get('logger');
                logger.error('핸들러 에러', {
                    requestId,
                    error: error.message,
                    stack: error.stack,
                    statusCode,
                    operation: error.operation || 'unknown'
                });
            } catch (logError) {
                console.error('로깅 에러:', logError);
            }
        }

        res.status(statusCode).json(errorResponse);
    } finally {
        if (api) {
            try {
                // 서버리스 환경에서는 즉시 정리하는 것이 좋음
                // setTimeout 사용 제거 (서버리스 환경에서는 불필요하고 메모리 누수 가능성 있음)
                api.destroy();
            } catch (cleanupError) {
                console.warn('리소스 정리 경고:', cleanupError);
            }
        }
    }
}

// ===== 배치 처리 전용 핸들러 =====
async function batchHandler(req, res) {
    const requestId = SafeUtils.generateRequestId();
    const startTime = Date.now();
    let api = null;

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

        if (!hasProcess || !process.env.TOURISM_API_KEY) {
            throw new TourismApiError('MISSING_API_KEY', 'batch', 500);
        }

        api = new AllTourismAPI();
        const logger = api.container.get('logger');

        logger.info('배치 요청 수신', {
            requestId,
            method: req.method
        });

        const { operations, options = {} } = req.body || {};

        if (!Array.isArray(operations) || operations.length === 0) {
            throw new ValidationError(
                'operations 배열이 필요합니다',
                'operations',
                operations
            );
        }

        if (operations.length > (options.maxBatchSize || 20)) {
            throw new ValidationError(
                `최대 ${options.maxBatchSize || 20}개의 작업만 배치로 처리할 수 있습니다`,
                'operations',
                operations.length
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

        // 배치 요청 처리는 AllTourismAPI 클래스의 batchRequest 메서드로 위임
        const batchResult = await api.batchRequest(operations);
        
        batchResult.metadata = {
            ...batchResult.metadata,
            requestId,
            totalTime: Date.now() - startTime,
            version: '2.1.0',
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
        console.error('Batch Handler Error:', error);

        const errorResponse = ResponseFormatter.formatError(error, 'batch');
        errorResponse.metadata = {
            requestId,
            totalTime: Date.now() - startTime,
            version: '2.1.0',
            timestamp: new Date().toISOString()
        };

        if (api) {
            try {
                const logger = api.container.get('logger');
                logger.error('배치 핸들러 에러', {
                    requestId,
                    error: error.message,
                    stack: error.stack
                });
            } catch (logError) {
                console.error('로깅 에러:', logError);
            }
        }

        res.status(error.statusCode || 500).json(errorResponse);
    } finally {
        if (api) {
            try {
                // 서버리스 환경에서는 즉시 정리하는 것이 좋음
                api.destroy();
            } catch (destroyError) {
                console.warn('배치 API 인스턴스 정리 경고:', destroyError);
            }
        }
    }
}

// ===== 메트릭 수집 핸들러 =====
async function metricsHandler(req, res) {
    let api = null;
    try {
        setCorsHeaders(res);

        if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
        }

        api = new AllTourismAPI();
        const logger = api.container.get('logger');
        const cache = api.container.get('cache');
        const rateLimiter = api.container.get('rateLimiter');

        const metrics = {
            timestamp: new Date().toISOString(),
            uptime: Date.now() - SERVICE_START_TIME,
            system: {
                memory: logger.getMemoryInfo(),
                version: api.container.get('config').get('version'),
                environment: api.container.get('config').get('environment')
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
        console.error('Metrics Handler Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (api) {
            try {
                // 서버리스 환경에서는 즉시 정리하는 것이 좋음
                api.destroy();
            } catch (destroyError) {
                console.warn('Metrics API 인스턴스 정리 경고:', destroyError);
            }
        }
    }
}

// ===== Prometheus 메트릭 포맷터 =====
function formatPrometheusMetrics(metrics) {
    const lines = [];

    lines.push('# HELP tourism_api_uptime_seconds API uptime in seconds');
    lines.push('# TYPE tourism_api_uptime_seconds gauge');
    lines.push(`tourism_api_uptime_seconds ${Math.floor(metrics.uptime / 1000)}`);

    if (metrics.system.memory.used) {
        lines.push('# HELP tourism_api_memory_used_bytes Memory usage in bytes');
        lines.push('# TYPE tourism_api_memory_used_bytes gauge');
        lines.push(`tourism_api_memory_used_bytes ${metrics.system.memory.used}`);
    }

    lines.push('# HELP tourism_api_cache_hit_rate Cache hit rate percentage');
    lines.push('# TYPE tourism_api_cache_hit_rate gauge');
    lines.push(`tourism_api_cache_hit_rate ${metrics.cache.hitRate}`);

    lines.push('# HELP tourism_api_cache_size Current cache size');
    lines.push('# TYPE tourism_api_cache_size gauge');
    lines.push(`tourism_api_cache_size ${metrics.cache.size}`);

    Object.entries(metrics.metrics).forEach(([key, metric]) => {
        const metricName = `tourism_api_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        lines.push(`# HELP ${metricName} ${metric.name || key}`);
        lines.push(`# TYPE ${metricName} gauge`);
        lines.push(`${metricName} ${metric.avg || metric.count || 0}`);
    });

    return lines.join('\n') + '\n';
}

// ===== 모듈 내보내기 =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = handler;
    module.exports.handler = handler;
    module.exports.batchHandler = batchHandler;
    module.exports.metricsHandler = metricsHandler;
    module.exports.healthCheck = healthCheck;
    module.exports.AllTourismAPI = AllTourismAPI;
    module.exports.TourismApiError = TourismApiError;
    module.exports.ValidationError = ValidationError;
    module.exports.ApiTimeoutError = ApiTimeoutError;
    module.exports.RateLimitError = RateLimitError;
    module.exports.SecurityError = SecurityError;
    module.exports.ConstantsManager = ConstantsManager;
    module.exports.SafeUtils = SafeUtils;
    module.exports.GeoUtils = GeoUtils;
    module.exports.ResponseFormatter = ResponseFormatter;
    module.exports.ApiResponseProcessor = ApiResponseProcessor;
} else if (typeof window !== 'undefined') {
    window.AllTourismAPI = AllTourismAPI;
    window.TourismApiError = TourismApiError;
    window.ValidationError = ValidationError;
    window.ApiTimeoutError = ApiTimeoutError;
    window.RateLimitError = RateLimitError;
    window.SecurityError = SecurityError;
    window.ConstantsManager = ConstantsManager;
    window.SafeUtils = SafeUtils;
    window.GeoUtils = GeoUtils;
    window.ResponseFormatter = ResponseFormatter;
    window.ApiResponseProcessor = ApiResponseProcessor;
}

// ===== 전역 에러 핸들러 (Node.js 환경에서만) =====
if (hasProcess) {
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('SIGTERM', () => {
        console.log('SIGTERM 신호 수신, 우아한 종료 시작...');
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log('SIGINT 신호 수신, 우아한 종료 시작...');
        process.exit(0);
    });
}

// ===== API 버전 정보 =====
const API_VERSION = '2.1.0';
const API_BUILD_DATE = new Date().toISOString();

if (typeof module !== 'undefined' && module.exports) {
    module.exports.VERSION = API_VERSION;
    module.exports.BUILD_DATE = API_BUILD_DATE;
} else if (typeof window !== 'undefined') {
    window.TOURISM_API_VERSION = API_VERSION;
    window.TOURISM_API_BUILD_DATE = API_BUILD_DATE;
}

console.log(`🚀 All Tourism API v${API_VERSION} 로드 완료 (${new Date().toISOString()})`);

