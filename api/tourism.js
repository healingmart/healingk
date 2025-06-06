11번 파일의 분석을 바탕으로 10번 파일의 모든 문제점을 수정한 완벽한 코드를 제작하겠습니다.

# 🚀 완벽한 All Tourism API v2.1.0

**주요 개선사항:**
- 모든 정규식 문법 오류 수정
- 메모리 누수 방지 강화
- XSS 보안 패턴 대폭 개선
- 성능 최적화 및 리소스 관리 개선
- 에러 처리 및 로깅 시스템 강화

```javascript
'use strict';

// ===== 런타임 환경 감지 및 의존성 로딩 =====
const isNode = typeof window === 'undefined';
const hasProcess = typeof process !== 'undefined';

if (isNode && typeof fetch === 'undefined') {
    try {
        const nodeFetch = require('node-fetch');
        const AbortControllerPolyfill = require('abort-controller');
        global.fetch = nodeFetch;
        global.AbortController = AbortControllerPolyfill;
    } catch (error) {
        console.error('❌ Required dependencies missing. Install with: npm install node-fetch@2 abort-controller');
        throw new Error(`Missing dependencies: ${error.message}`);
    }
}

const SERVICE_START_TIME = Date.now();

// ===== 고급 유틸리티 클래스 =====
class SafeUtils {
    static safeParseInt(value, defaultValue = 0, radix = 10) {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        const parsed = parseInt(String(value), radix);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    static safeParseFloat(value, defaultValue = 0.0) {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        const parsed = parseFloat(String(value));
        return isNaN(parsed) ? defaultValue : parsed;
    }

    static safeParseBool(value, defaultValue = false) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
        }
        return defaultValue;
    }

    static safeStringify(obj, maxDepth = 3, currentDepth = 0) {
        if (currentDepth >= maxDepth) return '[Max Depth Reached]';

        try {
            if (obj === null || obj === undefined) return String(obj);
            if (typeof obj !== 'object') return JSON.stringify(obj);

            // 순환 참조 감지를 위한 WeakSet 사용
            const seen = new WeakSet();

            const stringifyWithDepth = (value, depth) => {
                if (depth >= maxDepth) return '[Max Depth Reached]';
                if (value === null || value === undefined) return String(value);
                if (typeof value !== 'object') return JSON.stringify(value);

                // 순환 참조 검사
                if (seen.has(value)) return '[Circular Reference]';
                seen.add(value);

                try {
                    if (Array.isArray(value)) {
                        // 스트림 처리로 메모리 효율성 개선
                        const processedItems = [];
                        const maxItems = Math.min(value.length, 50);
                        for (let i = 0; i < maxItems; i++) {
                            processedItems.push(stringifyWithDepth(value[i], depth + 1));
                        }
                        return `[${processedItems.join(',')}${value.length > 50 ? '...' : ''}]`;
                    }

                    const keys = Object.keys(value).sort().slice(0, 20);
                    if (keys.length === 0) return '{}';

                    const pairs = keys.map(key => {
                        try {
                            const keyStr = JSON.stringify(key);
                            const valueStr = stringifyWithDepth(value[key], depth + 1);
                            return `${keyStr}:${valueStr}`;
                        } catch (keyError) {
                            return `"${key}":"[Error]"`;
                        }
                    });

                    const hasMore = Object.keys(value).length > 20;
                    return `{${pairs.join(',')}${hasMore ? ',"...":"[truncated]"' : ''}}`;
                } finally {
                    seen.delete(value);
                }
            };

            return stringifyWithDepth(obj, currentDepth);
        } catch (error) {
            return `[Stringify Error: ${error.message || 'Unknown error'}]`;
        }
    }

    static deepClone(obj) {
        try {
            if (obj === null || typeof obj !== 'object') return obj;
            if (obj instanceof Date) return new Date(obj);
            if (obj instanceof RegExp) return new RegExp(obj);
            if (Array.isArray(obj)) return obj.map(item => this.deepClone(item));

            const cloned = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    cloned[key] = this.deepClone(obj[key]);
                }
            }
            return cloned;
        } catch (error) {
            console.warn('Deep clone failed, returning original:', error);
            return obj;
        }
    }

    static sanitizeInput(input, maxLength = 1000, options = {}) {
        if (typeof input !== 'string') return input;

        const {
            removeHtml = true,
            preventXss = true,
            allowedTags = [],
            strictMode = false
        } = options;

        let sanitized = input.slice(0, maxLength).trim();

        if (removeHtml) {
            if (allowedTags.length > 0) {
                // 수정된 정규식 - 문법 오류 해결
                const allowedPattern = allowedTags.join('|');
                const regex = new RegExp(`<(?!\\/?(?:${allowedPattern})\\b)[^>]*>`, 'gi');
                sanitized = sanitized.replace(regex, '');
            } else {
                sanitized = sanitized.replace(/<[^>]*>/g, '');
            }
        }

        if (preventXss) {
            // 대폭 강화된 XSS 방지 패턴
            const xssPatterns = [
                /<script[^>]*>.*?<\/script>/gi,
                /<iframe[^>]*>.*?<\/iframe>/gi,
                /<object[^>]*>.*?<\/object>/gi,
                /<embed[^>]*>.*?<\/embed>/gi,
                /<link[^>]*>/gi,
                /<meta[^>]*>/gi,
                /<style[^>]*>.*?<\/style>/gi,
                /javascript:/gi,
                /vbscript:/gi,
                /data:(?!image\/)[^;]*;base64/gi, // 악성 data URI
                /\.\.\/|\.\.\\|\.\.\%2f|\.\.\%5c/gi, // 경로 순회
                /\bjavascript\s*:/gi, // 공백이 포함된 javascript:
                /\bvbscript\s*:/gi,   // 공백이 포함된 vbscript:
                /\bdata\s*:/gi,       // 공백이 포함된 data:
                /<\s*script/gi,       // 공백이 포함된 script 태그
                /style\s*=.*expression/gi, // CSS expression
                /on\w+\s*=/gi,
                /eval\s*\(/gi,
                /expression\s*\(/gi,
                /setTimeout\s*\(/gi,
                /setInterval\s*\(/gi,
                /-moz-binding/gi,
                /behavior\s*:/gi,
                /binding\s*:/gi,
                /import\s*\(/gi,
                /document\s*\./gi,
                /window\s*\./gi
            ];

            for (const pattern of xssPatterns) {
                sanitized = sanitized.replace(pattern, '');
            }

            if (strictMode) {
                sanitized = sanitized
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#x27;')
                    .replace(/\//g, '&#x2F;');
            }
        }

        // HTML 엔티티 디코딩
        sanitized = sanitized
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, '/');

        return sanitized;
    }

    static sanitizeKeyword(keyword) {
        return this.sanitizeInput(keyword, 100, {
            removeHtml: true,
            preventXss: true,
            strictMode: true
        });
    }

    static isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    static maskSensitiveData(data, sensitiveKeys = ['password', 'apikey', 'token', 'secret', 'servicekey']) {
        if (typeof data !== 'object' || data === null) return data;

        const masked = this.deepClone(data);
        const maskValue = (obj) => {
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    const lowerKey = key.toLowerCase();
                    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
                        obj[key] = '***MASKED***';
                    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                        maskValue(obj[key]);
                    }
                }
            }
        };

        maskValue(masked);
        return masked;
    }

    static generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ===== 고급 에러 클래스들 =====
class TourismApiError extends Error {
    constructor(message, operation, statusCode = 500, details = {}, data = {}, i18n = null) {
        super(message);
        this.name = 'TourismApiError';
        this.code = message;
        this.operation = operation;
        this.statusCode = statusCode;
        this.details = details;
        this.data = data;
        this.timestamp = new Date().toISOString();
        this.i18n = i18n;

        // 스택 트레이스 보존
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, TourismApiError);
        }

        // 원본 에러 정보 보존
        if (details.originalError instanceof Error) {
            this.originalStack = details.originalError.stack;
        }

        if (i18n && typeof i18n.getMessage === 'function') {
            try {
                this.localizedMessage = i18n.getMessage(message, details);
            } catch {
                this.localizedMessage = message;
            }
        } else {
            this.localizedMessage = message;
        }
    }
}

class ValidationError extends TourismApiError {
    constructor(message, field, value, i18n = null) {
        super(message, 'validation', 400, { field, value }, {}, i18n);
        this.name = 'ValidationError';
        this.field = field;
        this.value = value;
    }
}

class ApiTimeoutError extends TourismApiError {
    constructor(timeout, operation, i18n = null) {
        super('API_TIMEOUT', operation, 408, { timeout }, {}, i18n);
        this.name = 'ApiTimeoutError';
        this.timeout = timeout;
    }
}

class RateLimitError extends TourismApiError {
    constructor(limit, remaining, i18n = null) {
        super('RATE_LIMIT_EXCEEDED', 'rateLimit', 429, { limit, remaining }, {}, i18n);
        this.name = 'RateLimitError';
        this.limit = limit;
        this.remaining = remaining;
    }
}

class SecurityError extends TourismApiError {
    constructor(message, details = {}, i18n = null) {
        super('SECURITY_ERROR', 'security', 403, details, {}, i18n);
        this.name = 'SecurityError';
    }
}

// ===== 상수 관리자 =====
class ConstantsManager {
    constructor() {
        this.SUPPORTED_OPERATIONS = [
            'areaBasedList', 'detailCommon', 'detailIntro', 'detailInfo', 'detailImage',
            'searchKeyword', 'searchFestival', 'locationBasedList', 'areaCode', 'categoryCode', 'batchDetail'
        ];

        this.CONTENT_TYPES = {
            '12': { ko: '관광지', en: 'Tourist Attraction', ja: '観光地', zh: '旅游景点' },
            '14': { ko: '문화시설', en: 'Cultural Facility', ja: '文化施設', zh: '文化设施' },
            '15': { ko: '축제공연행사', en: 'Festival/Event', ja: 'イベント', zh: '节庆活动' },
            '25': { ko: '여행코스', en: 'Travel Course', ja: '旅行コース', zh: '旅游路线' },
            '28': { ko: '레포츠', en: 'Sports/Recreation', ja: 'レジャー', zh: '休闲运动' },
            '32': { ko: '숙박', en: 'Accommodation', ja: '宿泊', zh: '住宿' },
            '38': { ko: '쇼핑', en: 'Shopping', ja: 'ショッピング', zh: '购物' },
            '39': { ko: '음식점', en: 'Restaurant', ja: 'レストラン', zh: '餐厅' }
        };

        this.AREA_CODES = {
            '1': { ko: '서울', en: 'Seoul', ja: 'ソウル', zh: '首尔' },
            '2': { ko: '인천', en: 'Incheon', ja: '仁川', zh: '仁川' },
            '3': { ko: '대전', en: 'Daejeon', ja: '大田', zh: '大田' },
            '4': { ko: '대구', en: 'Daegu', ja: '大邱', zh: '大邱' },
            '5': { ko: '광주', en: 'Gwangju', ja: '光州', zh: '光州' },
            '6': { ko: '부산', en: 'Busan', ja: '釜山', zh: '釜山' },
            '7': { ko: '울산', en: 'Ulsan', ja: '蔚山', zh: '蔚山' },
            '8': { ko: '세종특별자치시', en: 'Sejong', ja: '世宗', zh: '世宗' },
            '31': { ko: '경기도', en: 'Gyeonggi-do', ja: '京畿道', zh: '京畿道' },
            '32': { ko: '강원도', en: 'Gangwon-do', ja: '江原道', zh: '江原道' },
            '33': { ko: '충청북도', en: 'Chungcheongbuk-do', ja: '忠清北道', zh: '忠清北道' },
            '34': { ko: '충청남도', en: 'Chungcheongnam-do', ja: '忠清南道', zh: '忠清南道' },
            '35': { ko: '경상북도', en: 'Gyeongsangbuk-do', ja: '慶尚北道', zh: '庆尚北道' },
            '36': { ko: '경상남도', en: 'Gyeongsangnam-do', ja: '慶尚南道', zh: '庆尚南道' },
            '37': { ko: '전라북도', en: 'Jeollabuk-do', ja: '全羅北道', zh: '全罗北道' },
            '38': { ko: '전라남도', en: 'Jeollanam-do', ja: '全羅南道', zh: '全罗南道' },
            '39': { ko: '제주도', en: 'Jeju-do', ja: '済州島', zh: '济州岛' }
        };

        this.DEFAULT_PAGINATION = {
            numOfRows: '10',
            pageNo: '1',
            maxRows: 1000,
            maxPage: 1000
        };

        this.RATE_LIMITS = {
            default: 100,
            premium: 1000,
            enterprise: 10000
        };

        this.CACHE_SETTINGS = {
            defaultTTL: 300000, // 5분
            longTTL: 3600000,   // 1시간
            shortTTL: 60000,    // 1분
            maxSize: 1000
        };
    }

    isValidOperation(operation) {
        return this.SUPPORTED_OPERATIONS.includes(operation);
    }

    getContentTypeName(code, lang = 'ko') {
        const contentType = this.CONTENT_TYPES[code];
        return contentType ? (contentType[lang] || contentType.ko) : '알 수 없음';
    }

    getAreaName(code, lang = 'ko') {
        const area = this.AREA_CODES[code];
        return area ? (area[lang] || area.ko) : '알 수 없음';
    }

    getAllContentTypes(lang = 'ko') {
        const result = {};
        for (const [code, names] of Object.entries(this.CONTENT_TYPES)) {
            result[code] = names[lang] || names.ko;
        }
        return result;
    }

    getAllAreaCodes(lang = 'ko') {
        const result = {};
        for (const [code, names] of Object.entries(this.AREA_CODES)) {
            result[code] = names[lang] || names.ko;
        }
        return result;
    }
}

// ===== 다국어 지원 관리자 =====
class InternationalizationManager {
    constructor() {
        this.currentLanguage = 'ko';
        this.supportedLanguages = ['ko', 'en', 'ja', 'zh'];
        this.fallbackLanguage = 'ko';
        this.messages = {
            ko: {
                'UNSUPPORTED_OPERATION': '지원하지 않는 작업입니다: {operation}',
                'VALIDATION_ERROR': '입력값 검증 오류',
                'FIELD_REQUIRED': '필수 필드입니다: {field}',
                'TYPE_MISMATCH': '잘못된 타입입니다. 예상: {type}, 실제: {actual}',
                'INVALID_FORMAT': '잘못된 형식입니다: {field}',
                'MIN_LENGTH_ERROR': '최소 길이: {minLength}, 현재: {actual}',
                'MAX_LENGTH_ERROR': '최대 길이: {maxLength}, 현재: {actual}',
                'NUMERIC_ERROR': '숫자여야 합니다: {field}',
                'INVALID_RANGE': '범위를 벗어났습니다: {field} ({min}-{max})',
                'ENUM_ERROR': '허용된 값: {values}',
                'API_TIMEOUT': 'API 요청 시간 초과 ({timeout}ms)',
                'RATE_LIMIT_EXCEEDED': '요청 한도 초과 (제한: {limit}/분)',
                'MISSING_API_KEY': 'API 키가 필요합니다',
                'INVALID_API_KEY': '유효하지 않은 API 키',
                'CORS_ERROR': 'CORS 정책 위반',
                'SECURITY_ERROR': '보안 오류: {details}',
                'NOT_FOUND': '데이터를 찾을 수 없습니다',
                'NETWORK_ERROR': '네트워크 오류: {error}',
                'INVALID_COORDINATES': '유효하지 않은 좌표: lat={lat}, lng={lng}',
                'INVALID_CONTENT_ID': '유효하지 않은 콘텐츠 ID: {contentId}',
                'BATCH_SIZE_EXCEEDED': '배치 크기 초과 (최대: {max}, 요청: {actual})'
            },
            en: {
                'UNSUPPORTED_OPERATION': 'Unsupported operation: {operation}',
                'VALIDATION_ERROR': 'Input validation error',
                'FIELD_REQUIRED': 'Required field: {field}',
                'TYPE_MISMATCH': 'Invalid type. Expected: {type}, Actual: {actual}',
                'INVALID_FORMAT': 'Invalid format: {field}',
                'MIN_LENGTH_ERROR': 'Minimum length: {minLength}, Actual: {actual}',
                'MAX_LENGTH_ERROR': 'Maximum length: {maxLength}, Actual: {actual}',
                'NUMERIC_ERROR': 'Must be numeric: {field}',
                'INVALID_RANGE': 'Out of range: {field} ({min}-{max})',
                'ENUM_ERROR': 'Allowed values: {values}',
                'API_TIMEOUT': 'API request timeout ({timeout}ms)',
                'RATE_LIMIT_EXCEEDED': 'Rate limit exceeded (limit: {limit}/min)',
                'MISSING_API_KEY': 'API key required',
                'INVALID_API_KEY': 'Invalid API key',
                'CORS_ERROR': 'CORS policy violation',
                'SECURITY_ERROR': 'Security error: {details}',
                'NOT_FOUND': 'Data not found',
                'NETWORK_ERROR': 'Network error: {error}',
                'INVALID_COORDINATES': 'Invalid coordinates: lat={lat}, lng={lng}',
                'INVALID_CONTENT_ID': 'Invalid content ID: {contentId}',
                'BATCH_SIZE_EXCEEDED': 'Batch size exceeded (max: {max}, requested: {actual})'
            },
            ja: {
                'UNSUPPORTED_OPERATION': 'サポートされていない操作: {operation}',
                'VALIDATION_ERROR': '入力値検証エラー',
                'FIELD_REQUIRED': '必須フィールド: {field}',
                'API_TIMEOUT': 'APIリクエストタイムアウト ({timeout}ms)',
                'RATE_LIMIT_EXCEEDED': 'レート制限を超過 (制限: {limit}/分)',
                'NOT_FOUND': 'データが見つかりません'
            },
            zh: {
                'UNSUPPORTED_OPERATION': '不支持的操作: {operation}',
                'VALIDATION_ERROR': '输入验证错误',
                'FIELD_REQUIRED': '必填字段: {field}',
                'API_TIMEOUT': 'API请求超时 ({timeout}ms)',
                'RATE_LIMIT_EXCEEDED': '请求限制超出 (限制: {limit}/分钟)',
                'NOT_FOUND': '未找到数据'
            }
        };
    }

    setLanguage(lang) {
        if (this.supportedLanguages.includes(lang)) {
            this.currentLanguage = lang;
            return true;
        }
        return false;
    }

    setLanguageFromHeader(acceptLanguage) {
        if (!acceptLanguage) return false;

        const languages = acceptLanguage.split(',')
            .map(lang => lang.split(';')[0].trim().toLowerCase())
            .map(lang => lang.split('-')[0]);

        for (const lang of languages) {
            if (this.setLanguage(lang)) {
                return true;
            }
        }
        return false;
    }

    getMessage(key, params = {}) {
        const messages = this.messages[this.currentLanguage] || this.messages[this.fallbackLanguage];
        let message = messages[key] || this.messages[this.fallbackLanguage][key] || key;

        Object.entries(params).forEach(([param, value]) => {
            const regex = new RegExp(`\\{${param}\\}`, 'g');
            message = message.replace(regex, String(value));
        });

        return message;
    }

    getSupportedLanguages() {
        return [...this.supportedLanguages];
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }

    addMessages(language, messages) {
        if (!this.messages[language]) {
            this.messages[language] = {};
        }
        Object.assign(this.messages[language], messages);
    }
}

// ===== 설정 관리자 =====
class ConfigManager {
    constructor(container) {
        this.container = container;
        this.config = {
            version: '2.1.0',
            environment: this.getEnvironment(),
            serviceKey: this.getServiceKey(),
            baseUrl: 'https://apis.data.go.kr/B551011/KorService1',
            maxConcurrent: 10,
            apiTimeout: 30000,
            rateLimitPerMinute: 100,
            maxCacheSize: 1000,
            cacheTTL: 300000,
            defaultLanguage: 'ko',
            enableMetrics: true,
            enableBatching: true,
            enableCompression: true,
            securityEnabled: true,
            allowedOrigins: ['*'],
            allowedApiKeys: [],
            maxMemorySize: 512 * 1024 * 1024,
            retryAttempts: 3,
            retryDelay: 1000,
            logLevel: 'info',
            enableCaching: true,
            enableRateLimiting: true
        };

        this.subscribers = new Map();
        this.loadEnvironmentConfig();
    }

    getEnvironment() {
        return (hasProcess && process.env.NODE_ENV) || 'development';
    }

    getServiceKey() {
        const possibleKeys = ['SERVICE_KEY', 'TOURISM_API_KEY', 'API_KEY'];

        if (hasProcess) {
            for (const key of possibleKeys) {
                if (process.env[key]) {
                    return process.env[key].trim();
                }
            }
        }

        return '';
    }

    loadEnvironmentConfig() {
        if (!hasProcess) return;

        const envMappings = {
            TOURISM_API_KEY: 'serviceKey',
            SERVICE_KEY: 'serviceKey',
            API_TIMEOUT: 'apiTimeout',
            MAX_CONCURRENT: 'maxConcurrent',
            RATE_LIMIT_PER_MINUTE: 'rateLimitPerMinute',
            MAX_CACHE_SIZE: 'maxCacheSize',
            CACHE_TTL: 'cacheTTL',
            DEFAULT_LANGUAGE: 'defaultLanguage',
            ALLOWED_ORIGINS: 'allowedOrigins',
            ALLOWED_API_KEYS: 'allowedApiKeys',
            ENABLE_METRICS: 'enableMetrics',
            ENABLE_BATCHING: 'enableBatching',
            SECURITY_ENABLED: 'securityEnabled',
            LOG_LEVEL: 'logLevel',
            RETRY_ATTEMPTS: 'retryAttempts',
            RETRY_DELAY: 'retryDelay'
        };

        Object.entries(envMappings).forEach(([envKey, configKey]) => {
            const envValue = process.env[envKey];
            if (envValue) {
                try {
                    if (configKey === 'allowedOrigins' || configKey === 'allowedApiKeys') {
                        const parsed = envValue.split(',').map(s => s.trim()).filter(s => s.length > 0);
                        if (parsed.length === 0) {
                            console.warn(`Empty array for ${envKey}, using default`);
                            return;
                        }
                        this.config[configKey] = parsed;
                    } else if (typeof this.config[configKey] === 'number') {
                        const numValue = SafeUtils.safeParseInt(envValue, this.config[configKey]);
                        if (numValue <= 0 && configKey.includes('timeout')) {
                            console.warn(`Invalid timeout value for ${envKey}: ${envValue}`);
                            return;
                        }
                        this.config[configKey] = numValue;
                    } else if (typeof this.config[configKey] === 'boolean') {
                        this.config[configKey] = SafeUtils.safeParseBool(envValue, this.config[configKey]);
                    } else {
                        this.config[configKey] = envValue;
                    }
                } catch (error) {
                    console.warn(`Failed to parse environment variable ${envKey}: ${error.message}`);
                }
            }
        });
    }

    get(key) {
        return this.config[key];
    }

    set(key, value) {
        const oldValue = this.config[key];
        this.config[key] = value;
        this.notifySubscribers(key, value, oldValue);
        return true;
    }

    subscribe(callback) {
        const id = Math.random().toString(36).substr(2, 9);
        this.subscribers.set(id, callback);
        return () => this.subscribers.delete(id);
    }

    notifySubscribers(key, newValue, oldValue) {
        this.subscribers.forEach(callback => {
            try {
                callback(key, newValue, oldValue);
            } catch (error) {
                console.error('Config subscriber error:', error);
            }
        });
    }



```javascript
    hasValidApiKey() {
        return !!(this.config.serviceKey && this.config.serviceKey.length > 10);
    }

    validateConfig() {
        const errors = [];

        if (!this.hasValidApiKey()) {
            errors.push('SERVICE_KEY is required and must be valid');
        }

        if (this.config.maxConcurrent <= 0) {
            errors.push('maxConcurrent must be positive');
        }

        if (this.config.apiTimeout <= 0) {
            errors.push('apiTimeout must be positive');
        }

        if (this.config.rateLimitPerMinute <= 0) {
            errors.push('rateLimitPerMinute must be positive');
        }

        if (errors.length > 0) {
            if (this.config.environment === 'production') {
                throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
            } else {
                console.warn('Configuration warnings:', errors);
            }
        }

        return true;
    }

    getPublicConfig() {
        const publicConfig = { ...this.config };
        delete publicConfig.serviceKey;
        delete publicConfig.allowedApiKeys;
        return publicConfig;
    }
}

// ===== 고급 로거 =====
class Logger {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logLevel = this.getLogLevel();
        this.metrics = new Map();
        this.logBuffer = [];
        this.maxBufferSize = 1000;
        this.logLevels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
    }

    getLogLevel() {
        const level = this.configManager.get('logLevel') || 'info';
        return this.logLevels[level] || 1;
    }

    log(level, message, data = {}) {
        const levelIndex = this.logLevels[level] || 1;
        if (levelIndex < this.logLevel) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            data: SafeUtils.maskSensitiveData(data),
            service: 'AllTourism',
            version: this.configManager.get('version'),
            environment: this.configManager.get('environment'),
            requestId: data.requestId || null
        };

        // 콘솔 출력
        const consoleMethod = console[level] || console.log;
        if (typeof data === 'object' && Object.keys(data).length > 0) {
            consoleMethod(`[${logEntry.timestamp}] ${level.toUpperCase()}: ${message}`, SafeUtils.maskSensitiveData(data));
        } else {
            consoleMethod(`[${logEntry.timestamp}] ${level.toUpperCase()}: ${message}`);
        }

        // 버퍼에 저장
        this.logBuffer.push(logEntry);
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
        }

        // 외부 로깅 서비스로 전송 (필요시)
        this.sendToExternalLogger(logEntry);
    }

    debug(message, data) { this.log('debug', message, data); }
    info(message, data) { this.log('info', message, data); }
    warn(message, data) { this.log('warn', message, data); }
    error(message, data) { this.log('error', message, data); }

    metric(name, value, tags = {}) {
        if (!this.configManager.get('enableMetrics')) return;

        const timestamp = Date.now();
        const key = `${name}_${SafeUtils.safeStringify(tags)}`;

        if (!this.metrics.has(key)) {
            this.metrics.set(key, {
                name,
                tags,
                values: [],
                count: 0,
                sum: 0,
                min: Infinity,
                max: -Infinity,
                avg: 0,
                lastUpdated: timestamp
            });
        }

        const metric = this.metrics.get(key);
        metric.values.push({ value, timestamp });
        metric.count++;
        metric.sum += value;
        metric.min = Math.min(metric.min, value);
        metric.max = Math.max(metric.max, value);
        metric.avg = metric.sum / metric.count;
        metric.lastUpdated = timestamp;

        // 최근 1000개 값만 유지
        if (metric.values.length > 1000) {
            metric.values = metric.values.slice(-1000);
        }
    }

    getMetrics() {
        const result = {};
        this.metrics.forEach((metric, key) => {
            result[key] = {
                name: metric.name,
                tags: metric.tags,
                count: metric.count,
                sum: metric.sum,
                min: metric.min === Infinity ? 0 : metric.min,
                max: metric.max === -Infinity ? 0 : metric.max,
                avg: metric.avg,
                lastUpdated: metric.lastUpdated,
                recent: metric.values.slice(-10)
            };
        });
        return result;
    }

    getMemoryInfo() {
        if (hasProcess && process.memoryUsage) {
            return {
                ...process.memoryUsage(),
                source: 'process.memoryUsage'
            };
        }

        if (typeof performance !== 'undefined' && performance.memory) {
            return {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit,
                source: 'performance.memory'
            };
        }

        return { source: 'unavailable' };
    }

    getRecentLogs(count = 100) {
        return this.logBuffer.slice(-count);
    }

    sendToExternalLogger(logEntry) {
        // 외부 로깅 서비스 연동 (예: Datadog, CloudWatch 등)
        // 현재는 구현하지 않음
    }

    clearMetrics() {
        this.metrics.clear();
    }

    clearLogs() {
        this.logBuffer = [];
    }
}

// ===== 고급 캐시 시스템 =====
class AdvancedCache {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');
        this.cache = new Map();
        
        // 안전한 기본값 설정
        this.maxSize = this.configManager?.get('maxCacheSize') || 1000;
        this.defaultTTL = this.configManager?.get('cacheTTL') || 300000;
        
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            memoryUsage: 0
        };
        this.accessOrder = new Map();
        this.sizeEstimates = new Map();

        this.startCleanupTimer();
        this.startStatsTimer();
    }

    generateKey(operation, params) {
        const sortedParams = Object.keys(params).sort().reduce((obj, key) => {
            obj[key] = params[key];
            return obj;
        }, {});
        return `${operation}:${SafeUtils.safeStringify(sortedParams)}`;
    }

    get(key) {
        if (this.cache.has(key)) {
            const item = this.cache.get(key);
            if (this.isExpired(item)) {
                this.delete(key);
                this.stats.misses++;
                return null;
            }

            // accessCount 증가 로직 추가
            item.accessCount++;
            this.accessOrder.set(key, Date.now());
            this.stats.hits++;
            this.logger.debug('Cache hit', { key, operation: key.split(':')[0] });
            return item.data;
        }

        this.stats.misses++;
        this.logger.debug('Cache miss', { key, operation: key.split(':')[0] });
        return null;
    }

    set(key, data, ttl = this.defaultTTL) {
        if (!this.configManager.get('enableCaching')) return;

        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }

        const size = this.estimateSize(data);
        const item = {
            data,
            timestamp: Date.now(),
            ttl,
            size,
            accessCount: 0
        };

        this.cache.set(key, item);
        this.accessOrder.set(key, Date.now());
        this.sizeEstimates.set(key, size);
        this.stats.sets++;
        this.stats.memoryUsage += size;

        this.logger.debug('Cache set', {
            key,
            size,
            ttl,
            operation: key.split(':')[0],
            totalSize: this.stats.memoryUsage
        });
    }

    delete(key) {
        const item = this.cache.get(key);
        if (item) {
            this.stats.memoryUsage -= item.size;
        }

        const deleted = this.cache.delete(key);
        this.accessOrder.delete(key);
        this.sizeEstimates.delete(key);

        if (deleted) {
            this.stats.deletes++;
            this.logger.debug('Cache delete', { key, operation: key.split(':')[0] });
        }

        return deleted;
    }

    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.accessOrder.clear();
        this.sizeEstimates.clear();
        this.stats.deletes += size;
        this.stats.memoryUsage = 0;
        this.logger.info('Cache cleared', { deletedItems: size });
    }

    isExpired(item) {
        return Date.now() - item.timestamp > item.ttl;
    }

    evictLRU() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, time] of this.accessOrder) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.delete(oldestKey);
            this.stats.evictions++;
            this.logger.debug('Cache eviction', { key: oldestKey, reason: 'LRU' });
        }
    }

    estimateSize(data) {
        try {
            return JSON.stringify(data).length * 2; // UTF-16 추정
        } catch {
            return 1000; // 기본값
        }
    }

    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // 1분마다
    }

    startStatsTimer() {
        this.statsInterval = setInterval(() => {
            this.updateStats();
        }, 30000); // 30초마다
    }

    cleanup() {
        const expiredKeys = [];
        const now = Date.now();

        for (const [key, item] of this.cache) {
            if (now - item.timestamp > item.ttl) {
                expiredKeys.push(key);
            }
        }

        expiredKeys.forEach(key => {
            this.delete(key);
        });

        if (expiredKeys.length > 0) {
            this.logger.debug('Cache cleanup completed', {
                expiredItems: expiredKeys.length,
                totalItems: this.cache.size
            });
        }
    }

    updateStats() {
        const total = this.stats.hits + this.stats.misses;
        this.logger.metric('cache_hit_rate', total > 0 ? (this.stats.hits / total) * 100 : 0);
        this.logger.metric('cache_size', this.cache.size);
        this.logger.metric('cache_memory_usage', this.stats.memoryUsage);
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
            size: this.cache.size,
            maxSize: this.maxSize,
            memoryUsageFormatted: this.formatBytes(this.stats.memoryUsage)
        };
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getTopItems(limit = 10) {
        const items = Array.from(this.cache.entries())
            .map(([key, item]) => ({
                key,
                accessCount: item.accessCount,
                size: item.size,
                age: Date.now() - item.timestamp,
                operation: key.split(':')[0]
            }))
            .sort((a, b) => b.accessCount - a.accessCount)
            .slice(0, limit);

        return items;
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }

        // 추가 정리 작업
        this.clear();
        this.accessOrder.clear();
        this.sizeEstimates.clear();

        this.logger.info('Cache destroyed');
    }
}

// ===== 고급 레이트 리미터 =====
class RateLimiter {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');
        this.requests = new Map();
        this.windowSize = 60000; // 1분
        this.limit = this.configManager.get('rateLimitPerMinute');
        this.enabled = this.configManager.get('enableRateLimiting');

        this.startCleanupTimer();
        this.startStatsTimer();
    }

    isAllowed(clientId = 'default') {
        if (!this.enabled) return true;

        const now = Date.now();
        const windowStart = now - this.windowSize;

        if (!this.requests.has(clientId)) {
            this.requests.set(clientId, []);
        }

        const clientRequests = this.requests.get(clientId);

        // 윈도우 밖의 요청들 제거
        while (clientRequests.length > 0 && clientRequests[0] < windowStart) {
            clientRequests.shift();
        }

        if (clientRequests.length >= this.limit) {
            this.logger.warn('Rate limit exceeded', {
                clientId,
                limit: this.limit,
                current: clientRequests.length
            });
            this.logger.metric('rate_limit_exceeded', 1, { clientId });
            return false;
        }

        clientRequests.push(now);
        this.logger.metric('rate_limit_request', 1, { clientId });
        return true;
    }

    getRemainingQuota(clientId = 'default') {
        if (!this.enabled) return this.limit;

        const now = Date.now();
        const windowStart = now - this.windowSize;

        if (!this.requests.has(clientId)) {
            return this.limit;
        }

        const clientRequests = this.requests.get(clientId);
        const validRequests = clientRequests.filter(time => time >= windowStart);

        return Math.max(0, this.limit - validRequests.length);
    }

    getResetTime(clientId = 'default') {
        if (!this.enabled) return 0;

        const now = Date.now();
        const clientRequests = this.requests.get(clientId);

        if (!clientRequests || clientRequests.length === 0) {
            return 0;
        }

        const oldestRequest = Math.min(...clientRequests);
        return Math.max(0, (oldestRequest + this.windowSize) - now);
    }

    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // 1분마다
    }

    startStatsTimer() {
        this.statsInterval = setInterval(() => {
            this.updateStats();
        }, 30000); // 30초마다
    }

    cleanup() {
        const now = Date.now();
        const windowStart = now - this.windowSize;
        let cleanedClients = 0;

        for (const [clientId, requests] of this.requests) {
            const validRequests = requests.filter(time => time >= windowStart);

            if (validRequests.length === 0) {
                this.requests.delete(clientId);
                cleanedClients++;
            } else {
                this.requests.set(clientId, validRequests);
            }
        }

        if (cleanedClients > 0) {
            this.logger.debug('Rate limiter cleanup', { cleanedClients });
        }
    }

    updateStats() {
        this.logger.metric('rate_limiter_active_clients', this.requests.size);

        let totalRequests = 0;
        for (const requests of this.requests.values()) {
            totalRequests += requests.length;
        }

        this.logger.metric('rate_limiter_total_requests', totalRequests);
    }

    getStats() {
        const now = Date.now();
        const windowStart = now - this.windowSize;
        const clients = {};
        let totalRequests = 0;

        for (const [clientId, requests] of this.requests) {
            const validRequests = requests.filter(time => time >= windowStart);
            clients[clientId] = {
                requests: validRequests.length,
                remaining: Math.max(0, this.limit - validRequests.length),
                resetTime: this.getResetTime(clientId)
            };
            totalRequests += validRequests.length;
        }

        return {
            enabled: this.enabled,
            limit: this.limit,
            windowSize: this.windowSize,
            activeClients: this.requests.size,
            totalRequests,
            clients
        };
    }

    setLimit(newLimit) {
        this.limit = newLimit;
        this.logger.info('Rate limit updated', { newLimit });
    }

    disable() {
        this.enabled = false;
        this.logger.info('Rate limiting disabled');
    }

    enable() {
        this.enabled = true;
        this.logger.info('Rate limiting enabled');
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }

        this.requests.clear();
        this.logger.info('Rate limiter destroyed');
    }
}

// ===== 고급 HTTP 클라이언트 =====
class HttpClient {
    constructor(container) {
        this.container = container;
        this.configManager = container.get('config');
        this.logger = container.get('logger');
        this.maxConcurrent = this.configManager.get('maxConcurrent');
        this.currentConcurrent = 0;
        this.requestQueue = [];
        this.retryAttempts = this.configManager.get('retryAttempts');
        this.retryDelay = this.configManager.get('retryDelay');
        this.destroyed = false;
    }

    async getTourismData(operation, params, options = {}) {
        if (this.destroyed) {
            throw new TourismApiError('HTTP_CLIENT_DESTROYED', operation, 503);
        }

        return new Promise((resolve, reject) => {
            const request = {
                operation,
                params,
                options,
                resolve,
                reject,
                timestamp: Date.now(),
                attempts: 0
            };

            if (this.currentConcurrent >= this.maxConcurrent) {
                this.requestQueue.push(request);
                this.logger.debug('Request queued', {
                    operation,
                    queueSize: this.requestQueue.length
                });
                return;
            }

            this.executeRequest(request);
        });
    }

    async executeRequest(request) {
        const { operation, params, options, resolve, reject } = request;
        const startTime = Date.now();
        const timeout = options.timeout || this.configManager.get('apiTimeout');
        const requestId = options.requestId || SafeUtils.generateRequestId();

        try {
            this.currentConcurrent++;
            request.attempts++;

            const url = this.buildUrl(operation, params);
            const controller = new AbortController();

            const timeoutId = setTimeout(() => {
                controller.abort();
            }, timeout);

            this.logger.debug('HTTP request starting', {
                operation,
                requestId,
                url: this.maskUrl(url),
                attempt: request.attempts
            });

            const fetchOptions = {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': `AllTourism-Enterprise/${this.configManager.get('version')}`,
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'X-Request-ID': requestId
                },
                signal: controller.signal
            };

            // Compression 지원
            if (this.configManager.get('enableCompression')) {
                fetchOptions.headers['Accept-Encoding'] = 'gzip, deflate, br';
            }

            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                const error = new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
                error.statusCode = response.status;
                error.response = response;
                throw error;
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const error = new Error(`Invalid response content type: ${contentType}`);
                error.statusCode = 415;
                throw error;
            }

            const data = await response.json();
            const responseTime = Date.now() - startTime;

            // API 응답 코드 검증
            if (data.response?.header?.resultCode !== '0000') {
                const errorMsg = data.response?.header?.resultMsg || 'Unknown API error';
                const errorCode = data.response?.header?.resultCode || 'UNKNOWN';
                const error = new Error(`API Error ${errorCode}: ${errorMsg}`);
                error.statusCode = 400;
                error.apiErrorCode = errorCode;
                throw error;
            }

            this.logger.debug('HTTP request completed', {
                operation,
                requestId,
                responseTime,
                statusCode: response.status,
                dataSize: JSON.stringify(data).length
            });

            this.logger.metric('http_request_duration', responseTime, {
                operation,
                success: true,
                statusCode: response.status
            });

            resolve(data);

        } catch (error) {
            const responseTime = Date.now() - startTime;

            // 재시도 로직
            if (request.attempts < this.retryAttempts && this.shouldRetry(error)) {
                this.logger.warn('HTTP request failed, retrying', {
                    operation,
                    requestId,
                    attempt: request.attempts,
                    maxAttempts: this.retryAttempts,
                    error: error.message,
                    statusCode: error.statusCode
                });

                await SafeUtils.sleep(this.retryDelay * request.attempts);
                this.executeRequest(request);
                return;
            }

            // 에러 처리
            if (error.name === 'AbortError') {
                this.logger.error('HTTP request timeout', {
                    operation,
                    requestId,
                    timeout,
                    attempts: request.attempts
                });
                this.logger.metric('http_request_duration', responseTime, {
                    operation,
                    success: false,
                    error: 'timeout'
                });
                reject(new ApiTimeoutError(timeout, operation, this.container.get('i18n')));
            } else {
                this.logger.error('HTTP request failed', {
                    operation,
                    requestId,
                    error: error.message,
                    statusCode: error.statusCode,
                    attempts: request.attempts
                });
                this.logger.metric('http_request_duration', responseTime, {
                    operation,
                    success: false,
                    error: 'network',
                    statusCode: error.statusCode
                });
                reject(new TourismApiError('HTTP_ERROR', operation, error.statusCode || 503, {
                    originalError: error.message,
                    attempts: request.attempts,
                    requestId,
                    statusCode: error.statusCode
                }, {}, this.container.get('i18n')));
            }
        } finally {
            this.currentConcurrent--;
            this.processQueue();
        }
    }

    shouldRetry(error) {
        // AbortError (timeout)는 재시도하지 않음
        if (error.name === 'AbortError') return false;

        // statusCode 기반 재시도 결정
        if (error.statusCode) {
            // 4xx 클라이언트 에러는 재시도하지 않음
            if (error.statusCode >= 400 && error.statusCode < 500) {
                return false;
            }
            // 5xx 서버 에러는 재시도
            if (error.statusCode >= 500) {
                return true;
            }
        }

        // 네트워크 에러나 알 수 없는 에러는 재시도
        return true;
    }

    processQueue() {
        if (this.requestQueue.length > 0 && this.currentConcurrent < this.maxConcurrent && !this.destroyed) {
            const next = this.requestQueue.shift();
            this.executeRequest(next);
        }
    }

    buildUrl(operation, params) {
        const baseUrl = this.configManager.get('baseUrl');
        const serviceKey = this.configManager.get('serviceKey');

        const endpoints = {
            'areaBasedList': 'areaBasedList1',
            'detailCommon': 'detailCommon1',
            'detailIntro': 'detailIntro1',
            'detailInfo': 'detailInfo1',
            'detailImage': 'detailImage1',
            'searchKeyword': 'searchKeyword1',
            'searchFestival': 'searchFestival1',
            'locationBasedList': 'locationBasedList1',
            'areaCode': 'areaCode1',
            'categoryCode': 'categoryCode1'
        };

        const endpoint = endpoints[operation] || operation;
        const url = new URL(`${baseUrl}/${endpoint}`);

        // 기본 파라미터
        url.searchParams.set('serviceKey', serviceKey);
        url.searchParams.set('MobileOS', 'ETC');
        url.searchParams.set('MobileApp', 'AllTourism');
        url.searchParams.set('_type', 'json');

        // 사용자 파라미터
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, String(value));
            }
        });

        return url.toString();
    }

    maskUrl(url) {
        try {
            const urlObj = new URL(url);
            if (urlObj.searchParams.has('serviceKey')) {
                urlObj.searchParams.set('serviceKey', '***MASKED***');
            }
            return urlObj.toString();
        } catch {
            return '[Invalid URL]';
        }
    }

    getStats() {
        return {
            currentConcurrent: this.currentConcurrent,
            maxConcurrent: this.maxConcurrent,
            queueSize: this.requestQueue.length,
            retryAttempts: this.retryAttempts,
            retryDelay: this.retryDelay
        };
    }

    destroy() {
        this.destroyed = true;
        const error = new TourismApiError('HTTP_CLIENT_DESTROYED', 'destroy', 503, {
            message: 'HTTP client was destroyed while requests were pending'
        });

        let rejectedCount = 0;
        while (this.requestQueue.length > 0) {
            const request = this.requestQueue.shift();
            try {
                request.reject(error);
                rejectedCount++;
            } catch (rejectionError) {
                this.logger.warn('Error rejecting queued request', {
                    operation: request.operation,
                    error: rejectionError.message
                });
            }
        }

        this.currentConcurrent = 0;
        this.logger.info('HTTP client destroyed', {
            rejectedRequests: rejectedCount
        });
    }
}

// ===== 지리 유틸리티 (고급 버전) =====
class GeoUtils {
    static calculateDistance(lat1, lon1, lat2, lon2) {
        try {
            const numLat1 = SafeUtils.safeParseFloat(lat1);
            const numLon1 = SafeUtils.safeParseFloat(lon1);
            const numLat2 = SafeUtils.safeParseFloat(lat2);
            const numLon2 = SafeUtils.safeParseFloat(lon2);

            if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) {
                return null;
            }

            if (Math.abs(numLat1) > 90 || Math.abs(numLat2) > 90 || 
                Math.abs(numLon1) > 180 || Math.abs(numLon2) > 180) {
                return null;
            }

         




```javascript
            const R = 6371; // 지구 반지름 (km)
            const dLat = this.toRadians(numLat2 - numLat1);
            const dLon = this.toRadians(numLon2 - numLon1);

            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(this.toRadians(numLat1)) * Math.cos(this.toRadians(numLat2)) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c;

            return Math.round(distance * 1000) / 1000; // 소수점 3자리까지
        } catch (error) {
            console.warn('Distance calculation failed:', error);
            return null;
        }
    }

    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    static toDegrees(radians) {
        return radians * (180 / Math.PI);
    }

    static calculateBearing(lat1, lon1, lat2, lon2) {
        try {
            const numLat1 = this.toRadians(SafeUtils.safeParseFloat(lat1));
            const numLat2 = this.toRadians(SafeUtils.safeParseFloat(lat2));
            const deltaLon = this.toRadians(SafeUtils.safeParseFloat(lon2) - SafeUtils.safeParseFloat(lon1));

            const y = Math.sin(deltaLon) * Math.cos(numLat2);
            const x = Math.cos(numLat1) * Math.sin(numLat2) -
                    Math.sin(numLat1) * Math.cos(numLat2) * Math.cos(deltaLon);

            const bearing = this.toDegrees(Math.atan2(y, x));
            return (bearing + 360) % 360; // 0-360도로 정규화
        } catch (error) {
            return null;
        }
    }

    static getCardinalDirection(bearing) {
        if (bearing === null) return null;

        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                          'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

        const index = Math.round(bearing / 22.5) % 16;
        return directions[index];
    }

    static addDistanceInfo(items, userLat, userLng, radius = null) {
        if (!items || !Array.isArray(items)) return items;
        if (!userLat || !userLng) return items;

        try {
            const userLatNum = SafeUtils.safeParseFloat(userLat);
            const userLngNum = SafeUtils.safeParseFloat(userLng);

            if (isNaN(userLatNum) || isNaN(userLngNum)) return items;

            const itemsWithDistance = items.map(item => {
                if (!item) return item;

                let distance = null;
                let bearing = null;
                let direction = null;
                let distanceText = null;

                if (item.mapx && item.mapy) {
                    distance = this.calculateDistance(userLatNum, userLngNum, item.mapy, item.mapx);
                    if (distance !== null) {
                        bearing = this.calculateBearing(userLatNum, userLngNum, item.mapy, item.mapx);
                        direction = this.getCardinalDirection(bearing);
                        distanceText = this.formatDistance(distance);
                    }
                }

                return {
                    ...item,
                    distance,
                    bearing,
                    direction,
                    meta: {
                        ...item.meta,
                        distanceText,
                        directionText: direction ? `${direction} 방향` : null,
                        coordinatesValid: !!(item.mapx && item.mapy)
                    }
                };
            });

            // 반경 필터링
            let filteredItems = itemsWithDistance;
            if (radius && !isNaN(SafeUtils.safeParseFloat(radius))) {
                const radiusKm = SafeUtils.safeParseFloat(radius);
                filteredItems = itemsWithDistance.filter(item => 
                    item.distance === null || item.distance <= radiusKm
                );
            }

            // 거리순 정렬
            return filteredItems.sort((a, b) => {
                const distA = a.distance !== null ? a.distance : 999999;
                const distB = b.distance !== null ? b.distance : 999999;
                return distA - distB;
            });
        } catch (error) {
            console.warn('Distance processing failed:', error);
            return items;
        }
    }

    static formatDistance(distance) {
        if (distance === null || isNaN(distance)) return null;

        try {
            if (distance < 0.001) {
                return `${Math.round(distance * 1000000)}mm`;
            } else if (distance < 1) {
                return `${Math.round(distance * 1000)}m`;
            } else if (distance < 10) {
                return `${Math.round(distance * 10) / 10}km`;
            } else {
                return `${Math.round(distance)}km`;
            }
        } catch (error) {
            return `${distance}km`;
        }
    }

    static isValidCoordinate(lat, lng) {
        const numLat = SafeUtils.safeParseFloat(lat);
        const numLng = SafeUtils.safeParseFloat(lng);

        return !isNaN(numLat) && !isNaN(numLng) &&
               numLat >= -90 && numLat <= 90 &&
               numLng >= -180 && numLng <= 180;
    }

    static getBoundingBox(lat, lng, radiusKm) {
        try {
            const latRad = this.toRadians(lat);
            const deltaLat = radiusKm / 111; // 대략적인 위도 1도당 거리 (111km)
            const deltaLng = radiusKm / (111 * Math.cos(latRad));

            return {
                north: lat + deltaLat,
                south: lat - deltaLat,
                east: lng + deltaLng,
                west: lng - deltaLng
            };
        } catch (error) {
            return null;
        }
    }
}

// ===== 서비스 컨테이너 (의존성 주입) =====
class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.factories = new Map();
        this.instances = new Map();
        this.dependencies = new Map();
        this._initialized = false;
        this._destroyed = false;
    }

    register(name, factory, dependencies = []) {
        if (this._destroyed) {
            throw new Error('Container has been destroyed');
        }

        if (typeof factory !== 'function') {
            throw new Error('Factory must be a function');
        }

        this.factories.set(name, factory);
        this.dependencies.set(name, dependencies);
        return this;
    }

    get(name) {
        if (this._destroyed) {
            throw new Error('Container has been destroyed');
        }

        if (this.instances.has(name)) {
            return this.instances.get(name);
        }

        if (!this.factories.has(name)) {
            throw new Error(`Service '${name}' not registered`);
        }

        // 순환 의존성 검사
        if (this._isCircularDependency(name, new Set())) {
            throw new Error(`Circular dependency detected for service '${name}'`);
        }

        const factory = this.factories.get(name);
        const instance = factory(this);
        this.instances.set(name, instance);
        return instance;
    }

    has(name) {
        return this.factories.has(name) || this.instances.has(name);
    }

    _isCircularDependency(serviceName, visited) {
        if (visited.has(serviceName)) {
            return true;
        }

        visited.add(serviceName);
        const deps = this.dependencies.get(serviceName) || [];

        for (const dep of deps) {
            if (this._isCircularDependency(dep, new Set(visited))) {
                return true;
            }
        }

        return false;
    }

    initialize() {
        if (this._initialized) return this;

        // 의존성 순서에 따라 초기화
        const initOrder = this._getInitializationOrder();

        initOrder.forEach(serviceName => {
            if (this.factories.has(serviceName)) {
                this.get(serviceName);
            }
        });

        this._initialized = true;
        return this;
    }

    _getInitializationOrder() {
        // 기본 초기화 순서 (의존성이 적은 것부터)
        return [
            'constants',
            'i18n',
            'config',
            'logger',
            'cache',
            'rateLimiter',
            'validator',
            'httpClient'
        ];
    }

    isInitialized() {
        return this._initialized;
    }

    getRegisteredServices() {
        return Array.from(this.factories.keys());
    }

    getInstancedServices() {
        return Array.from(this.instances.keys());
    }

    destroy() {
        if (this._destroyed) return;

        // 인스턴스들을 역순으로 정리
        const instances = Array.from(this.instances.entries()).reverse();
        instances.forEach(([name, instance]) => {
            try {
                if (instance && typeof instance.destroy === 'function') {
                    instance.destroy();
                }
            } catch (error) {
                console.error(`Error destroying service ${name}:`, error);
            }
        });

        this.services.clear();
        this.factories.clear();
        this.instances.clear();
        this.dependencies.clear();
        this._destroyed = true;
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
            metadata: {
                operation,
                ...metadata,
                cache: metadata.cache || { fromCache: false },
                performance: {
                    apiResponseTime: 0,
                    totalProcessingTime: 0,
                    ...performance
                }
            }
        };
    }

    static formatError(error, operation = 'unknown') {
        const baseError = {
            success: false,
            timestamp: new Date().toISOString(),
            operation,
            error: {
                code: error.code || error.name || 'UNKNOWN_ERROR',
                message: error.localizedMessage || error.message || 'An unknown error occurred',
                operation,
                statusCode: error.statusCode || 500
            },
            metadata: {
                errorType: error.constructor.name,
                timestamp: new Date().toISOString()
            }
        };

        // 개발 환경에서만 상세 정보 포함
        if (hasProcess && process.env.NODE_ENV === 'development') {
            baseError.error.details = error.details || {};
            baseError.error.stack = error.stack;
            baseError.metadata.development = true;
        }

        return baseError;
    }

    static addCacheInfo(response, fromCache, cacheStats = {}) {
        if (typeof response === 'object' && response.metadata) {
            response.metadata.cache = {
                fromCache,
                ...cacheStats,
                timestamp: new Date().toISOString()
            };
        }
        return response;
    }

    static addPerformanceInfo(response, performance = {}) {
        if (typeof response === 'object' && response.metadata) {
            response.metadata.performance = {
                ...response.metadata.performance,
                ...performance
            };
        }
        return response;
    }
}

// ===== API 응답 처리기 =====
class ApiResponseProcessor {
    static extractItems(apiResponse) {
        try {
            const body = apiResponse?.response?.body;
            if (!body) return [];

            // items.item 구조
            if (body.items?.item) {
                return Array.isArray(body.items.item) ? body.items.item : [body.items.item];
            }

            // item 구조 (단일 또는 배열)
            if (body.item) {
                return Array.isArray(body.item) ? body.item : [body.item];
            }

            return [];
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
                // 개선된 HTML 태그 처리
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

        // HTTP/HTTPS 검증 개선
        if (!url.startsWith('http://') && !url.startsWith('https://')) return null;

        try {
            new URL(url);
        } catch {
            return null;
        }

        // 이미지 확장자 검증 개선 - endsWith 사용
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        const hasValidExtension = imageExtensions.some(ext => 
            url.toLowerCase().endsWith(ext)
        );

        return hasValidExtension ? url : null;
    }

    static sanitizeCoordinate(coord) {
        if (!coord) return null;
        const num = SafeUtils.safeParseFloat(coord);
        // 수정: num === 0 조건 제거 (0은 유효한 좌표값)
        if (isNaN(num)) return null;

        // 한국 지역 좌표 범위 검증 개선
        if (Math.abs(num) > 180) return null;

        return num;
    }

    static formatDate(dateString) {
        if (!dateString) return null;

        try {
            // YYYYMMDDHHMMSS 형식 (14자리)
            if (/^\d{14}$/.test(dateString)) {
                const year = parseInt(dateString.substring(0, 4));
                const month = parseInt(dateString.substring(4, 6));
                const day = parseInt(dateString.substring(6, 8));
                const hour = parseInt(dateString.substring(8, 10));
                const minute = parseInt(dateString.substring(10, 12));
                const second = parseInt(dateString.substring(12, 14));

                // 날짜 유효성 검증
                if (!this.isValidDateTime(year, month, day, hour, minute, second)) {
                    return null;
                }

                return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
            }

            // YYYYMMDD 형식 (8자리)
            if (/^\d{8}$/.test(dateString)) {
                const year = parseInt(dateString.substring(0, 4));
                const month = parseInt(dateString.substring(4, 6));
                const day = parseInt(dateString.substring(6, 8));

                // 날짜 유효성 검증
                if (!this.isValidDate(year, month, day)) {
                    return null;
                }

                return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            }

            // ISO 형식이면 그대로 반환
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

        // JavaScript Date로 유효성 검증
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

    // 코드 API 전용 프로세서 추가
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
                // 수정된 정규식 - 문법 오류 해결
                pattern: /^-?\d+\.?\d*$/,
                custom: 'latitude',
                sanitize: true
            },
            userLng: {
                type: 'string',
                // 수정된 정규식 - 문법 오류 해결
                pattern: /^-?\d+\.?\d*$/,
                custom: 'longitude',
                sanitize: true
            },
            radius: {
                type: 'string',
                pattern: /^\d+\.?\d*$/,
                min: 0.1,
                max: 20000,
                sanitize: true
            }
        };

        // areaBasedList 스키마
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

        // detailCommon 스키마
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

        // searchKeyword 스키마
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

        // 나머지 스키마들...
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
                pattern: /^-?\d+\.?\d*$/,
                custom: 'longitude',
                sanitize: true
            },
            mapY: {
                type: 'string',
                required: true,
                pattern: /^-?\d+\.?\d*$/,
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



```javascript
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
            const validAreaCodes = ['1', '2', '3', '4', '5', '6', '7', '8', 
                                  '31', '32', '33', '34', '35', '36', '37', '38', '39'];
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

            // 강화된 XSS 및 SQL 인젝션 방지 패턴
            const dangerousPatterns = [
                /<script[^>]*>.*?<\/script>/gi,
                /javascript:/gi,
                /on\w+\s*=/gi,
                /eval\s*\(/gi,
                /expression\s*\(/gi,
                /<iframe/gi,
                /<object/gi,
                /<embed/gi,
                // SQL 인젝션 패턴 추가
                /(\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b|\bunion\b)/gi,
                /('|(\\x27)|(\\x2D\\x2D)|(%27)|(%2D%2D))/gi,
                /((\%3D)|(=))[^\n]*((\%27)|(\\x27)|(')|(\-\-)|(\%3B)|(;))/gi
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
            throw new ValidationError('Validator has been destroyed', 'system', 'destroyed', this.i18n);
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

            // 스키마 기반 검증
            for (const [field, rules] of Object.entries(schema)) {
                const result = this.validateField(field, params[field], rules);

                if (result.errors.length > 0) {
                    errors.push(...result.errors);
                } else if (result.value !== undefined) {
                    sanitizedParams[field] = result.value;
                }
            }

            // 추가 비즈니스 로직 검증
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
            // 기본값 설정
            if ((value === undefined || value === null || value === '') && rules.default) {
                value = rules.default;
            }

            // 필수 필드 검증
            if (rules.required && (value === undefined || value === null || value === '')) {
                result.errors.push(`${field}: ${this.i18n.getMessage('FIELD_REQUIRED', { field })}`);
                return result;
            }

            // 값이 없으면 통과
            if (value === undefined || value === null || value === '') {
                return result;
            }

            // 입력 sanitization
            let sanitizedValue = value;
            if (rules.sanitize && typeof value === 'string') {
                sanitizedValue = SafeUtils.sanitizeInput(value, rules.maxLength || 1000);
            }

            // 타입 변환
            if (rules.transform && typeof rules.transform === 'function') {
                sanitizedValue = rules.transform(sanitizedValue);
            }

            // 타입 검증
            if (rules.type && typeof sanitizedValue !== rules.type) {
                result.errors.push(`${field}: ${this.i18n.getMessage('TYPE_MISMATCH', {
                    type: rules.type,
                    actual: typeof sanitizedValue
                })}`);
                return result;
            }

            // 패턴 검증
            if (rules.pattern && typeof sanitizedValue === 'string' && !rules.pattern.test(sanitizedValue)) {
                result.errors.push(`${field}: ${this.i18n.getMessage('INVALID_FORMAT', { field })}`);
                return result;
            }

            // 문자열 길이 검증
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

            // 숫자 범위 검증
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

            // 열거형 검증
            if (rules.enum && !rules.enum.includes(sanitizedValue)) {
                result.errors.push(`${field}: ${this.i18n.getMessage('ENUM_ERROR', {
                    values: rules.enum.join(', ')
                })}`);
                return result;
            }

            // 커스텀 검증
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
            // 날짜 범위 검증 - 개선된 비교 로직
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

            // 좌표 검증
            if (params.userLat && params.userLng) {
                if (!GeoUtils.isValidCoordinate(params.userLat, params.userLng)) {
                    errors.push(this.i18n.getMessage('INVALID_COORDINATES', {
                        lat: params.userLat,
                        lng: params.userLng
                    }));
                }
            }

            // 위치 기반 검색에서 좌표 필수 검증
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
    constructor(options = {}) {
        this.startTime = Date.now();
        this.container = new ServiceContainer();
        this.setupServices(options);
        this.container.initialize();

        // 설정 검증
        try {
            this.container.get('config').validateConfig();
        } catch (error) {
            console.warn('Configuration validation warning:', error.message);
        }

        const logger = this.container.get('logger');
        logger.info('AllTourismAPI initialized', {
            version: this.container.get('config').get('version'),
            environment: this.container.get('config').get('environment'),
            hasApiKey: this.container.get('config').hasValidApiKey()
        });
    }

    setupServices(options) {
        this.container
            .register('constants', () => new ConstantsManager())
            .register('i18n', () => new InternationalizationManager())
            .register('config', (container) => {
                const configManager = new ConfigManager(container);
                Object.entries(options).forEach(([key, value]) => {
                    configManager.set(key, value);
                });
                return configManager;
            })
            .register('logger', (container) => new Logger(container))
            .register('cache', (container) => new AdvancedCache(container))
            .register('rateLimiter', (container) => new RateLimiter(container))
            .register('validator', (container) => new InputValidator(container))
            .register('httpClient', (container) => new HttpClient(container));
    }

    // ===== 메인 API 메서드들 =====

    async areaBasedList(params = {}) {
        const operation = 'areaBasedList';
        const startTime = Date.now();
        const requestId = SafeUtils.generateRequestId();

        try {
            const validator = this.container.get('validator');
            const cache = this.container.get('cache');
            const httpClient = this.container.get('httpClient');
            const logger = this.container.get('logger');
            const rateLimiter = this.container.get('rateLimiter');

            logger.debug('areaBasedList 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            // 레이트 리미트 확인
            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    this.container.get('i18n')
                );
            }

            // 입력 검증
            const sanitizedParams = validator.validate(operation, params);
            const {
                numOfRows = '10',
                pageNo = '1',
                arrange = 'A',
                contentTypeId = '',
                areaCode = '',
                sigunguCode = '',
                cat1 = '',
                cat2 = '',
                cat3 = '',
                modifiedtime = '',
                userLat = '',
                userLng = '',
                radius = ''
            } = sanitizedParams;

            // 캐시 키 생성 (위치 정보 제외)
            const cacheableParams = {
                numOfRows, pageNo, arrange, contentTypeId,
                areaCode, sigunguCode, cat1, cat2, cat3, modifiedtime
            };
            const cacheKey = cache.generateKey(operation, cacheableParams);

            // 위치 정보가 없으면 캐시 확인
            if (!userLat && !userLng) {
                const cachedData = cache.get(cacheKey);
                if (cachedData) {
                    logger.metric('cache_hit', 1, { operation, requestId });
                    logger.debug('areaBasedList 캐시 히트', { requestId, cacheKey });
                    return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
                }
            }

            // API 요청 파라미터 구성
            const apiParams = { numOfRows, pageNo, arrange };
            const optionalParams = { contentTypeId, areaCode, sigunguCode, cat1, cat2, cat3, modifiedtime };

            Object.entries(optionalParams).forEach(([key, value]) => {
                if (value) apiParams[key] = value;
            });

            // API 호출
            const apiStartTime = Date.now();
            const data = await httpClient.getTourismData(operation, apiParams, { requestId });
            const apiTime = Date.now() - apiStartTime;

            // 응답 처리
            const items = ApiResponseProcessor.extractItems(data);
            let processedItems = items
                .map(item => ApiResponseProcessor.processBasicItem(item, this.container))
                .filter(item => item !== null);

            // 위치 기반 정보 추가
            if (userLat && userLng) {
                processedItems = GeoUtils.addDistanceInfo(processedItems, userLat, userLng, radius);
                logger.debug('위치 기반 필터링 적용', {
                    requestId,
                    originalCount: items.length,
                    filteredCount: processedItems.length
                });
            }

            const totalCount = SafeUtils.safeParseInt(data.response?.body?.totalCount, processedItems.length);
            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.formatSuccess(operation, {
                items: processedItems,
                pagination: {
                    totalCount,
                    pageNo: SafeUtils.safeParseInt(pageNo, 1),
                    numOfRows: SafeUtils.safeParseInt(numOfRows, 10),
                    totalPages: Math.ceil(totalCount / SafeUtils.safeParseInt(numOfRows, 10)),
                    hasNext: (SafeUtils.safeParseInt(pageNo, 1) * SafeUtils.safeParseInt(numOfRows, 10)) < totalCount,
                    hasPrev: SafeUtils.safeParseInt(pageNo, 1) > 1
                }
            }, {
                operation,
                requestId,
                itemCount: processedItems.length,
                hasLocationFilter: !!(userLat && userLng),
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            // 위치 정보가 없으면 캐시에 저장
            if (!userLat && !userLng) {
                cache.set(cacheKey, result);
                logger.debug('areaBasedList 캐시 저장', { requestId, cacheKey });
            }

            logger.metric('api_request_success', 1, {
                operation,
                requestId,
                itemCount: processedItems.length,
                responseTime: totalTime
            });

            logger.info('areaBasedList 요청 완료', {
                requestId,
                itemCount: processedItems.length,
                totalTime
            });

            return result;

        } catch (error) {
            let logger;
            try {
                logger = this.container.get('logger');
            } catch (loggerError) {
                console.error('Logger not available:', loggerError);
                logger = { error: console.error, metric: () => {} };
            }

            logger.error('areaBasedList 오류', {
                requestId,
                error: error.message,
                stack: error.stack,
                params: SafeUtils.maskSensitiveData(params)
            });

            logger.metric('api_request_error', 1, {
                operation,
                requestId,
                error: error.name
            });

            return ResponseFormatter.formatError(error, operation);
        }
    }

    async detailCommon(params = {}) {
        const operation = 'detailCommon';
        const startTime = Date.now();
        const requestId = SafeUtils.generateRequestId();

        try {
            const validator = this.container.get('validator');
            const cache = this.container.get('cache');
            const httpClient = this.container.get('httpClient');
            const logger = this.container.get('logger');
            const rateLimiter = this.container.get('rateLimiter');
            const i18n = this.container.get('i18n');

            logger.debug('detailCommon 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            // 레이트 리미트 확인
            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    i18n
                );
            }

            // 입력 검증
            const sanitizedParams = validator.validate(operation, params);
            const { contentId, ...otherParams } = sanitizedParams;

            const cacheKey = cache.generateKey(operation, sanitizedParams);

            // 캐시 확인
            const cachedData = cache.get(cacheKey);
            if (cachedData) {
                logger.metric('cache_hit', 1, { operation, requestId });
                logger.debug('detailCommon 캐시 히트', { requestId, contentId });
                return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
            }

            // API 호출
            const apiStartTime = Date.now();
            const data = await httpClient.getTourismData(operation, sanitizedParams, { requestId });
            const apiTime = Date.now() - apiStartTime;

            // 응답 처리
            const items = ApiResponseProcessor.extractItems(data);
            if (items.length === 0) {
                throw new TourismApiError('NOT_FOUND', operation, 404, { contentId }, {}, i18n);
            }

            const processedItem = ApiResponseProcessor.processBasicItem(items[0], this.container);
            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.formatSuccess(operation, processedItem, {
                operation,
                requestId,
                contentId,
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            // 캐시에 저장
            cache.set(cacheKey, result);
            logger.debug('detailCommon 캐시 저장', { requestId, contentId });

            logger.metric('api_request_success', 1, {
                operation,
                requestId,
                contentId,
                responseTime: totalTime
            });

            logger.info('detailCommon 요청 완료', { requestId, contentId, totalTime });

            return result;

        } catch (error) {
            let logger;
            try {
                logger = this.container.get('logger');
            } catch (loggerError) {
                console.error('Logger not available:', loggerError);
                logger = { error: console.error, metric: () => {} };
            }

            logger.error('detailCommon 오류', {
                requestId,
                error: error.message,
                stack: error.stack,
                params: SafeUtils.maskSensitiveData(params)
            });

            logger.metric('api_request_error', 1, {
                operation,
                requestId,
                error: error.name
            });

            return ResponseFormatter.formatError(error, operation);
        }
    }

    async searchKeyword(params = {}) {
        const operation = 'searchKeyword';
        const startTime = Date.now();
        const requestId = SafeUtils.generateRequestId();

        try {
            const validator = this.container.get('validator');
            const cache = this.container.get('cache');
            const httpClient = this.container.get('httpClient');
            const logger = this.container.get('logger');
            const rateLimiter = this.container.get('rateLimiter');

            logger.debug('searchKeyword 요청 시작', {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            // 레이트 리미트 확인
            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    this.container.get('i18n')
                );
            }

            // 입력 검증
            const sanitizedParams = validator.validate(operation, params);
            const {
                keyword,
                numOfRows = '10',
                pageNo = '1',
                arrange = 'A',
                contentTypeId = '',
                areaCode = '',
                sigunguCode = '',
                userLat = '',
                userLng = '',
                radius = ''
            } = sanitizedParams;

            // 캐시 키 생성 (위치 정보 제외)
            const cacheableParams = { keyword, numOfRows, pageNo, arrange, contentTypeId, areaCode, sigunguCode };
            const cacheKey = cache.generateKey(operation, cacheableParams);

            // 위치 정보가 없으면 캐시 확인
            if (!userLat && !userLng) {
                const cachedData = cache.get(cacheKey);
                if (cachedData) {
                    logger.metric('cache_hit', 1, { operation, requestId });
                    logger.debug('searchKeyword 캐시 히트', { requestId, keyword });
                    return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
                }
            }

            // API 요청 파라미터 구성
            const apiParams = { keyword, numOfRows, pageNo, arrange };
            const optionalParams = { contentTypeId, areaCode, sigunguCode };

            Object.entries(optionalParams).forEach(([key, value]) => {
                if (value) apiParams[key] = value;
            });

            // API 호출
            const apiStartTime = Date.now();
            const data = await httpClient.getTourismData(operation, apiParams, { requestId });
            const apiTime = Date.now() - apiStartTime;

            // 응답 처리
            const items = ApiResponseProcessor.extractItems(data);
            let processedItems = items
                .map(item => ApiResponseProcessor.processBasicItem(item, this.container))
                .filter(item => item !== null);

            // 위치 기반 정보 추가
            if (userLat && userLng) {
                processedItems = GeoUtils.addDistanceInfo(processedItems, userLat, userLng, radius);
                logger.debug('위치 기반 필터링 적용', {
                    requestId,
                    keyword,
                    originalCount: items.length,
                    filteredCount: processedItems.length
                });
            }

            const totalCount = SafeUtils.safeParseInt(data.response?.body?.totalCount, processedItems.length);
            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.formatSuccess(operation, {
                items: processedItems,
                pagination: {
                    totalCount,
                    pageNo: SafeUtils.safeParseInt(pageNo, 1),
                    numOfRows: SafeUtils.safeParseInt(numOfRows, 10),
                    totalPages: Math.ceil(totalCount / SafeUtils.safeParseInt(numOfRows, 10)),
                    hasNext: (SafeUtils.safeParseInt(pageNo, 1) * SafeUtils.safeParseInt(numOfRows, 10)) < totalCount,
                    hasPrev: SafeUtils.safeParseInt(pageNo, 1) > 1
                },
                searchQuery: {
                    keyword,
                    filters: { contentTypeId, areaCode, sigunguCode }
                }
            }, {
                operation,
                requestId,
                itemCount: processedItems.length,
                hasLocationFilter: !!(userLat && userLng),
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

           
```javascript
            // 위치 정보가 없으면 캐시에 저장
            if (!userLat && !userLng) {
                cache.set(cacheKey, result);
                logger.debug('searchKeyword 캐시 저장', { requestId, keyword });
            }

            logger.metric('api_request_success', 1, {
                operation,
                requestId,
                keyword,
                itemCount: processedItems.length,
                responseTime: totalTime
            });

            logger.info('searchKeyword 요청 완료', {
                requestId,
                keyword,
                itemCount: processedItems.length,
                totalTime
            });

            return result;

        } catch (error) {
            let logger;
            try {
                logger = this.container.get('logger');
            } catch (loggerError) {
                console.error('Logger not available:', loggerError);
                logger = { error: console.error, metric: () => {} };
            }

            logger.error('searchKeyword 오류', {
                requestId,
                error: error.message,
                stack: error.stack,
                params: SafeUtils.maskSensitiveData(params)
            });

            logger.metric('api_request_error', 1, {
                operation,
                requestId,
                error: error.name
            });

            return ResponseFormatter.formatError(error, operation);
        }
    }

    // ===== 추가 API 메서드들 =====

    async detailIntro(params = {}) {
        return this._executeDetailOperation('detailIntro', params);
    }

    async detailInfo(params = {}) {
        return this._executeDetailOperation('detailInfo', params);
    }

    async detailImage(params = {}) {
        return this._executeDetailOperation('detailImage', params, ApiResponseProcessor.processImageItem);
    }

    async locationBasedList(params = {}) {
        return this._executeLocationOperation('locationBasedList', params);
    }

    async searchFestival(params = {}) {
        return this._executeSearchOperation('searchFestival', params);
    }

    async areaCode(params = {}) {
        return this._executeCodeOperation('areaCode', params);
    }

    async categoryCode(params = {}) {
        return this._executeCodeOperation('categoryCode', params);
    }

    // ===== 공통 헬퍼 메서드들 =====

    async _executeDetailOperation(operation, params, customProcessor = null) {
        const startTime = Date.now();
        const requestId = SafeUtils.generateRequestId();

        try {
            const validator = this.container.get('validator');
            const cache = this.container.get('cache');
            const httpClient = this.container.get('httpClient');
            const logger = this.container.get('logger');
            const rateLimiter = this.container.get('rateLimiter');
            const i18n = this.container.get('i18n');

            logger.debug(`${operation} 요청 시작`, {
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

            const sanitizedParams = validator.validate(operation, params);
            const cacheKey = cache.generateKey(operation, sanitizedParams);

            const cachedData = cache.get(cacheKey);
            if (cachedData) {
                logger.metric('cache_hit', 1, { operation, requestId });
                return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
            }

            const apiStartTime = Date.now();
            const data = await httpClient.getTourismData(operation, sanitizedParams, { requestId });
            const apiTime = Date.now() - apiStartTime;

            const items = ApiResponseProcessor.extractItems(data);
            if (items.length === 0) {
                throw new TourismApiError('NOT_FOUND', operation, 404, sanitizedParams, {}, i18n);
            }

            const processor = customProcessor || ApiResponseProcessor.processBasicItem;
            const processedItems = items
                .map(item => processor(item, this.container))
                .filter(item => item !== null);

            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.formatSuccess(operation, {
                items: processedItems,
                count: processedItems.length
            }, {
                operation,
                requestId,
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            cache.set(cacheKey, result);

            logger.metric('api_request_success', 1, {
                operation,
                requestId,
                responseTime: totalTime
            });

            return result;

        } catch (error) {
            let logger;
            try {
                logger = this.container.get('logger');
            } catch (loggerError) {
                console.error('Logger not available:', loggerError);
                logger = { error: console.error, metric: () => {} };
            }

            logger.error(`${operation} 오류`, {
                requestId,
                error: error.message,
                stack: error.stack,
                params: SafeUtils.maskSensitiveData(params)
            });

            logger.metric('api_request_error', 1, {
                operation,
                requestId,
                error: error.name
            });

            return ResponseFormatter.formatError(error, operation);
        }
    }

    async _executeLocationOperation(operation, params) {
        const startTime = Date.now();
        const requestId = SafeUtils.generateRequestId();

        try {
            const validator = this.container.get('validator');
            const cache = this.container.get('cache');
            const httpClient = this.container.get('httpClient');
            const logger = this.container.get('logger');
            const rateLimiter = this.container.get('rateLimiter');

            logger.debug(`${operation} 요청 시작`, {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    this.container.get('i18n')
                );
            }

            const sanitizedParams = validator.validate(operation, params);
            const cacheKey = cache.generateKey(operation, sanitizedParams);

            const cachedData = cache.get(cacheKey);
            if (cachedData) {
                logger.metric('cache_hit', 1, { operation, requestId });
                return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
            }

            const apiStartTime = Date.now();
            const data = await httpClient.getTourismData(operation, sanitizedParams, { requestId });
            const apiTime = Date.now() - apiStartTime;

            const items = ApiResponseProcessor.extractItems(data);
            let processedItems = items
                .map(item => ApiResponseProcessor.processBasicItem(item, this.container))
                .filter(item => item !== null);

            // 거리 정보 추가 (locationBasedList는 이미 거리순으로 정렬됨)
            if (sanitizedParams.mapX && sanitizedParams.mapY) {
                processedItems = GeoUtils.addDistanceInfo(
                    processedItems,
                    sanitizedParams.mapY,
                    sanitizedParams.mapX,
                    sanitizedParams.radius
                );
            }

            const totalCount = SafeUtils.safeParseInt(data.response?.body?.totalCount, processedItems.length);
            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.formatSuccess(operation, {
                items: processedItems,
                pagination: {
                    totalCount,
                    pageNo: SafeUtils.safeParseInt(sanitizedParams.pageNo, 1),
                    numOfRows: SafeUtils.safeParseInt(sanitizedParams.numOfRows, 10),
                    totalPages: Math.ceil(totalCount / SafeUtils.safeParseInt(sanitizedParams.numOfRows, 10)),
                    hasNext: (SafeUtils.safeParseInt(sanitizedParams.pageNo, 1) * SafeUtils.safeParseInt(sanitizedParams.numOfRows, 10)) < totalCount,
                    hasPrev: SafeUtils.safeParseInt(sanitizedParams.pageNo, 1) > 1
                },
                location: {
                    mapX: sanitizedParams.mapX,
                    mapY: sanitizedParams.mapY,
                    radius: sanitizedParams.radius
                }
            }, {
                operation,
                requestId,
                itemCount: processedItems.length,
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            cache.set(cacheKey, result);

            logger.metric('api_request_success', 1, {
                operation,
                requestId,
                itemCount: processedItems.length,
                responseTime: totalTime
            });

            return result;

        } catch (error) {
            let logger;
            try {
                logger = this.container.get('logger');
            } catch (loggerError) {
                console.error('Logger not available:', loggerError);
                logger = { error: console.error, metric: () => {} };
            }

            logger.error(`${operation} 오류`, {
                requestId,
                error: error.message,
                stack: error.stack,
                params: SafeUtils.maskSensitiveData(params)
            });

            logger.metric('api_request_error', 1, {
                operation,
                requestId,
                error: error.name
            });

            return ResponseFormatter.formatError(error, operation);
        }
    }

    async _executeSearchOperation(operation, params) {
        const startTime = Date.now();
        const requestId = SafeUtils.generateRequestId();

        try {
            const validator = this.container.get('validator');
            const cache = this.container.get('cache');
            const httpClient = this.container.get('httpClient');
            const logger = this.container.get('logger');
            const rateLimiter = this.container.get('rateLimiter');

            logger.debug(`${operation} 요청 시작`, {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    this.container.get('i18n')
                );
            }

            const sanitizedParams = validator.validate(operation, params);
            const cacheKey = cache.generateKey(operation, sanitizedParams);

            const cachedData = cache.get(cacheKey);
            if (cachedData) {
                logger.metric('cache_hit', 1, { operation, requestId });
                return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
            }

            const apiStartTime = Date.now();
            const data = await httpClient.getTourismData(operation, sanitizedParams, { requestId });
            const apiTime = Date.now() - apiStartTime;

            const items = ApiResponseProcessor.extractItems(data);
            const processedItems = items
                .map(item => ApiResponseProcessor.processBasicItem(item, this.container))
                .filter(item => item !== null);

            const totalCount = SafeUtils.safeParseInt(data.response?.body?.totalCount, processedItems.length);
            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.formatSuccess(operation, {
                items: processedItems,
                pagination: {
                    totalCount,
                    pageNo: SafeUtils.safeParseInt(sanitizedParams.pageNo, 1),
                    numOfRows: SafeUtils.safeParseInt(sanitizedParams.numOfRows, 10),
                    totalPages: Math.ceil(totalCount / SafeUtils.safeParseInt(sanitizedParams.numOfRows, 10)),
                    hasNext: (SafeUtils.safeParseInt(sanitizedParams.pageNo, 1) * SafeUtils.safeParseInt(sanitizedParams.numOfRows, 10)) < totalCount,
                    hasPrev: SafeUtils.safeParseInt(sanitizedParams.pageNo, 1) > 1
                },
                searchCriteria: sanitizedParams
            }, {
                operation,
                requestId,
                itemCount: processedItems.length,
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            cache.set(cacheKey, result);

            logger.metric('api_request_success', 1, {
                operation,
                requestId,
                itemCount: processedItems.length,
                responseTime: totalTime
            });

            return result;

        } catch (error) {
            let logger;
            try {
                logger = this.container.get('logger');
            } catch (loggerError) {
                console.error('Logger not available:', loggerError);
                logger = { error: console.error, metric: () => {} };
            }

            logger.error(`${operation} 오류`, {
                requestId,
                error: error.message,
                stack: error.stack,
                params: SafeUtils.maskSensitiveData(params)
            });

            logger.metric('api_request_error', 1, {
                operation,
                requestId,
                error: error.name
            });

            return ResponseFormatter.formatError(error, operation);
        }
    }

    async _executeCodeOperation(operation, params) {
        const startTime = Date.now();
        const requestId = SafeUtils.generateRequestId();

        try {
            const validator = this.container.get('validator');
            const cache = this.container.get('cache');
            const httpClient = this.container.get('httpClient');
            const logger = this.container.get('logger');
            const rateLimiter = this.container.get('rateLimiter');

            logger.debug(`${operation} 요청 시작`, {
                requestId,
                params: SafeUtils.maskSensitiveData(params)
            });

            if (!rateLimiter.isAllowed(requestId)) {
                throw new RateLimitError(
                    rateLimiter.limit,
                    rateLimiter.getRemainingQuota(requestId),
                    this.container.get('i18n')
                );
            }

            const sanitizedParams = validator.validate(operation, params);
            const cacheKey = cache.generateKey(operation, sanitizedParams);

            // 코드 데이터는 장기간 캐시
            const cachedData = cache.get(cacheKey);
            if (cachedData) {
                logger.metric('cache_hit', 1, { operation, requestId });
                return ResponseFormatter.addCacheInfo(cachedData, true, cache.getStats());
            }

            const apiStartTime = Date.now();
            const data = await httpClient.getTourismData(operation, sanitizedParams, { requestId });
            const apiTime = Date.now() - apiStartTime;

            const items = ApiResponseProcessor.extractItems(data);
            // 코드 API용 특별 프로세서 사용
            const processedItems = items
                .map(item => ApiResponseProcessor.processCodeItem(item))
                .filter(item => item.code && item.name);

            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.formatSuccess(operation, {
                items: processedItems,
                count: processedItems.length
            }, {
                operation,
                requestId,
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            // 코드 데이터는 장시간 캐시 (1시간)
            const constants = this.container.get('constants');
            cache.set(cacheKey, result, constants.CACHE_SETTINGS.longTTL);

            logger.metric('api_request_success', 1, {
                operation,
                requestId,
                itemCount: processedItems.length,
                responseTime: totalTime
            });

            return result;

        } catch (error) {
            let logger;
            try {
                logger = this.container.get('logger');
            } catch (loggerError) {
                console.error('Logger not available:', loggerError);
                logger = { error: console.error, metric: () => {} };
            }

            logger.error(`${operation} 오류`, {
                requestId,
                error: error.message,
                stack: error.stack,
                params: SafeUtils.maskSensitiveData(params)
            });

            logger.metric('api_request_error', 1, {
                operation,
                requestId,
                error: error.name
            });

            return ResponseFormatter.formatError(error, operation);
        }
    }

    // ===== 유틸리티 메서드들 =====

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
                    uptime: Date.now() - this.startTime,
                    isInitialized: this.container.isInitialized(),
                    memoryUsage: logger.getMemoryInfo()
                },
                services: {
                    registered: this.container.getRegisteredServices(),
                    instanced: this.container.getInstancedServices()
                },
                cache: cache.getStats(),
                rateLimiter: rateLimiter.getStats(),
                httpClient: httpClient.getStats(),
                metrics: logger.getMetrics(),
                config: config.getPublicConfig()
            };
        } catch (error) {
            return ResponseFormatter.formatError(error, 'getSystemStatus');
        }
    }

    clearCache() {
        try {
            const cache = this.container.get('cache');
            cache.clear();
            const logger = this.container.get('logger');
            logger.info('캐시가 초기화되었습니다');

            return {
                success: true,
                message: '캐시가 성공적으로 초기화되었습니다'
            };
        } catch (error) {
            return ResponseFormatter.formatError(error, 'clearCache');
        }
    }

    setLanguage(language) {
        try {
            const i18n = this.container.get('i18n');
            const success = i18n.setLanguage(language);

            return {
                success,
                currentLanguage: i18n.getCurrentLanguage(),
                supportedLanguages: i18n.getSupportedLanguages(),
                message: success ? `언어가 ${language}로 변경되었습니다` : `지원하지 않는 언어: ${language}`
            };
        } catch (error) {
            return ResponseFormatter.formatError(error, 'setLanguage');
        }
    }

    async batchRequest(operations) {
        const startTime = Date.now();
        const requestId = SafeUtils.generateRequestId();

        try {
            const logger = this.container.get('logger');
            const config = this.container.get('config');

            if (!config.get('enableBatching')) {
                throw new TourismApiError('BATCH_DISABLED', 'batch', 403, {}, {}, this.container.get('i18n'));
            }

            if (!Array.isArray(operations) || operations.length === 0) {
                throw new ValidationError('operations 배열이 필요합니다', 'operations', operations);
            }

            if (operations.length > 10) {
                throw new ValidationError(
                    this.container.get('i18n').getMessage('BATCH_SIZE_EXCEEDED', {
                        max: 10,
                        actual: operations.length
                    }),
                    'operations',
                    operations.length
                );
            }

            logger.info('배치 요청 시작', {
                requestId,
                operationCount: operations.length
            });

            const results = await Promise.allSettled(operations.map(async (op, index) => {
                try {
                    const { operation, params } = op;

                    switch (operation) {
                        case 'areaBasedList':
                            return await this.areaBasedList(params);
                        case 'detailCommon':
                            return await this.detailCommon(params);
                        case 'searchKeyword':
                            return await this.searchKeyword(params);
                        case 'detailIntro':
                            return await this.detailIntro(params);
                        case 'detailInfo':
                            return await this.detailInfo(params);
                        case 'detailImage':
                            return await this.detailImage(params);
                        case 'locationBasedList':
                            return await this.locationBasedList(params);
                        case 'searchFestival':
                            return await this.searchFestival(params);
                        case 'areaCode':
                            return await this.areaCode(params);
                        case 'categoryCode':
                            return await this.categoryCode(params);
                        default:
                            throw new ValidationError(`배치에서 지원하지 않는 작업: ${operation}`, 'operation', operation);
                    }
                } catch (error) {
                    return ResponseFormatter.formatError(error, op.operation);
                }
            }));

            const processedResults = results.map((result, index) => ({
                index,
                operation: operations[index].operation,
                params: operations[index].params,
                success: result.status === 'fulfilled' && result.value?.success !== false,
                result: result.status === 'fulfilled' ? result.value : ResponseFormatter.formatError(result.reason, operations[index].operation)
            }));

            const totalTime = Date.now() - startTime;
            const successCount = processedResults.filter(r => r.success).length;

            logger.info('배치 요청 완료', {
                requestId,
                total: operations.length,
                successful: successCount,
                failed: operations.length - successCount,
                totalTime
            });

            return ResponseFormatter.formatSuccess('batch', {
                results: processedResults,
                summary: {
                    total: operations.length,
                    successful: successCount,
                    failed: operations.length - successCount
                }
            }, {
                requestId,
                batchSize: operations.length
            }, {
                totalProcessingTime: totalTime
            });

        } catch (error) {
            let logger;
            try {
                logger = this.container.get('logger');
            } catch (loggerError) {
                console.error('Logger not available:', loggerError);
                logger = { error: console.error };
            }

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
    const allowedOrigins = (hasProcess && process.env.ALLOWED_ORIGINS)
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : ['*'];

    const allowAllOrigins = allowedOrigins[0] === '*';
    res.setHeader('Access-Control-Allow-Origin', allowAllOrigins ? '*' : allowedOrigins.join(','));
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Accept-Language');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Access-Control-Allow-Credentials 설정 개선
    if (!allowAllOrigins) {
        res.setHeader('Access-Control-Allow-Credentials', 'true'); // 특정 오리진일 경우 true
    } else {
        res.setHeader('Access-Control-Allow-Credentials', 'false'); // 모든 오리진일 경우 반드시 false
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
            apiKeyConfigured: !!(hasProcess && (process.env.SERVICE_KEY || process.env.TOURISM_API_KEY)),
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
        // try...finally 구문으로 리소스 정리 보장
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
        // CORS 헤더 설정
        setCorsHeaders(res);

        // OPTIONS 요청 처리 (CORS preflight)
        if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
        }

        // API 키 검증
        if (!hasProcess || (!process.env.SERVICE_KEY && !process.env.TOURISM_API_KEY)) {
            throw new TourismApiError(
                'MISSING_API_KEY',
                'configuration',
                500,
                {
                    requestId,
                    message: 'SERVICE_KEY 또는 TOURISM_API_KEY 환경변수가 설정되지 않았습니다'
                }
            );
        }

        // API 인스턴스 생성
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

        // Accept-Language 헤더에서 언어 설정
        if (req.headers['accept-language']) {
            i18n.setLanguageFromHeader(req.headers['accept-language']);
        }

        // 파라미터 추출 및 검증
        let params = {};
        try {
            if (req.method === 'GET') {
                params = req.query || {};
            } else if (req.method === 'POST') {
                // Content-Type 검증
                const contentType = req.headers['content-type'] || '';
                if (!contentType.includes('application/json') && !contentType.includes('application/x-www-form-urlencoded')) {
                    throw new ValidationError(
                        '지원하지 않는 Content-Type입니다. application/json 또는 application/x-www-form-urlencoded를 사용해주세요.',
                        'contentType',
                        contentType
                    );
                }
                params = req.body || {};
            } else {
                throw new ValidationError('지원하지 않는 HTTP 메서드입니다', 'method', req.method);
            }
        } catch (parseError) {
            throw new ValidationError('요청 데이터 파싱 실패', 'body', 'malformed');
        }

        const { operation = 'areaBasedList', ...apiParams } = params;

      


        // 특수 작업 처리
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
                throw new ValidationError('배치 요청은 POST 메서드만 지원합니다', 'method', req.method);
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

        // 작업 검증
        const constants = api.container.get('constants');
        if (!constants.isValidOperation(operation)) {
            throw new ValidationError(
                i18n.getMessage('UNSUPPORTED_OPERATION', { operation }),
                'operation',
                operation,
                i18n
            );
        }

        // API 호출 실행
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

        // 응답 메타데이터 보강
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

        // 성공 응답
        logger.info('요청 완료', {
            requestId,
            operation,
            success: result.success,
            totalTime: result.metadata.totalTime
        });

        res.status(200).json(result);

    } catch (error) {
        console.error('Handler Error:', error);

        // 에러 응답 생성
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

        // 에러 로깅
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
        // 리소스 정리
        if (api) {
            try {
                // 개발 환경에서만 즉시 정리, 프로덕션에서는 지연 정리
                const isProduction = hasProcess && process.env.NODE_ENV === 'production';
                const delay = isProduction ? 5000 : 1000;

                setTimeout(() => {
                    try {
                        api.destroy();
                    } catch (destroyError) {
                        console.warn('API 인스턴스 정리 경고:', destroyError);
                    }
                }, delay);
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
            throw new ValidationError('배치 요청은 POST 메서드만 지원합니다', 'method', req.method);
        }

        // API 키 검증
        if (!hasProcess || (!process.env.SERVICE_KEY && !process.env.TOURISM_API_KEY)) {
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
            throw new ValidationError('operations 배열이 필요합니다', 'operations', operations);
        }

        if (operations.length > (options.maxBatchSize || 20)) {
            throw new ValidationError(
                `최대 ${options.maxBatchSize || 20}개의 작업만 배치로 처리할 수 있습니다`,
                'operations',
                operations.length
            );
        }

        // 배치 처리 옵션
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

        // 동시성 제어를 위한 청크 분할
        const chunks = [];
        for (let i = 0; i < operations.length; i += batchOptions.concurrency) {
            chunks.push(operations.slice(i, i + batchOptions.concurrency));
        }

        const allResults = [];
        let shouldStop = false;

        // 청크별 순차 처리, 청크 내에서는 병렬 처리
        for (let chunkIndex = 0; chunkIndex < chunks.length && !shouldStop; chunkIndex++) {
            const chunk = chunks[chunkIndex];

            const chunkPromises = chunk.map(async (op, localIndex) => {
                const globalIndex = chunkIndex * batchOptions.concurrency + localIndex;
                const opStartTime = Date.now();

                try {
                    const { operation, params = {} } = op;

                    if (!api.container.get('constants').isValidOperation(operation)) {
                        throw new ValidationError(`지원하지 않는 작업: ${operation}`, 'operation', operation);
                    }

                    // 타임아웃 제어
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new ApiTimeoutError(batchOptions.timeout, operation)), batchOptions.timeout);
                    });

                    const operationPromise = (async () => {
                        switch (operation) {
                            case 'areaBasedList':
                                return await api.areaBasedList(params);
                            case 'detailCommon':
                                return await api.detailCommon(params);
                            case 'searchKeyword':
                                return await api.searchKeyword(params);
                            case 'detailIntro':
                                return await api.detailIntro(params);
                            case 'detailInfo':
                                return await api.detailInfo(params);
                            case 'detailImage':
                                return await api.detailImage(params);
                            case 'locationBasedList':
                                return await api.locationBasedList(params);
                            case 'searchFestival':
                                return await api.searchFestival(params);
                            case 'areaCode':
                                return await api.areaCode(params);
                            case 'categoryCode':
                                return await api.categoryCode(params);
                            default:
                                throw new ValidationError(`배치에서 지원하지 않는 작업: ${operation}`, 'operation', operation);
                        }
                    })();

                    const result = await Promise.race([operationPromise, timeoutPromise]);
                    const opTime = Date.now() - opStartTime;

                    return {
                        index: globalIndex,
                        success: true,
                        operation,
                        params,
                        result,
                        processingTime: opTime
                    };

                } catch (error) {
                    const opTime = Date.now() - opStartTime;

                    if (batchOptions.stopOnError) {
                        shouldStop = true;
                    }

                    return {
                        index: globalIndex,
                        success: false,
                        operation: op.operation,
                        params: op.params,
                        error: {
                            code: error.name || 'UNKNOWN_ERROR',
                            message: error.message || '알 수 없는 오류',
                            statusCode: error.statusCode || 500
                        },
                        processingTime: opTime
                    };
                }
            });

            const chunkResults = await Promise.allSettled(chunkPromises);

            chunkResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    allResults[result.value.index] = result.value;
                } else {
                    allResults.push({
                        success: false,
                        error: {
                            code: 'BATCH_PROCESSING_ERROR',
                            message: result.reason?.message || '배치 처리 중 오류 발생'
                        }
                    });
                }
            });

            // 청크 간 잠시 대기 (서버 부하 방지)
            if (chunkIndex < chunks.length - 1) {
                await SafeUtils.sleep(100);
            }
        }

        const totalTime = Date.now() - startTime;
        const successCount = allResults.filter(r => r.success).length;
        const errorCount = allResults.length - successCount;

        const response = {
            success: true,
            timestamp: new Date().toISOString(),
            operation: 'batch',
            data: {
                results: allResults,
                summary: {
                    total: operations.length,
                    successful: successCount,
                    failed: errorCount,
                    successRate: ((successCount / operations.length) * 100).toFixed(2) + '%'
                },
                options: batchOptions
            },
            metadata: {
                requestId,
                totalTime,
                version: '2.1.0',
                batchSize: operations.length,
                chunksProcessed: chunks.length,
                averageTimePerOperation: totalTime / operations.length
            }
        };

        logger.info('배치 처리 완료', {
            requestId,
            total: operations.length,
            successful: successCount,
            failed: errorCount,
            totalTime
        });

        res.status(200).json(response);

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
            setTimeout(() => {
                try {
                    api.destroy();
                } catch (destroyError) {
                    console.warn('배치 API 인스턴스 정리 경고:', destroyError);
                }
            }, 2000);
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

        // Prometheus 형식 지원
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
        // 리소스 정리
        if (api) {
            setTimeout(() => {
                try {
                    api.destroy();
                } catch (destroyError) {
                    console.warn('Metrics API 인스턴스 정리 경고:', destroyError);
                }
            }, 100);
        }
    }
}

// ===== Prometheus 메트릭 포맷터 =====
function formatPrometheusMetrics(metrics) {
    const lines = [];

    // 시스템 메트릭
    lines.push('# HELP tourism_api_uptime_seconds API uptime in seconds');
    lines.push('# TYPE tourism_api_uptime_seconds gauge');
    lines.push(`tourism_api_uptime_seconds ${Math.floor(metrics.uptime / 1000)}`);

    // 메모리 메트릭
    if (metrics.system.memory.used) {
        lines.push('# HELP tourism_api_memory_used_bytes Memory usage in bytes');
        lines.push('# TYPE tourism_api_memory_used_bytes gauge');
        lines.push(`tourism_api_memory_used_bytes ${metrics.system.memory.used}`);
    }

    // 캐시 메트릭
    lines.push('# HELP tourism_api_cache_hit_rate Cache hit rate percentage');
    lines.push('# TYPE tourism_api_cache_hit_rate gauge');
    lines.push(`tourism_api_cache_hit_rate ${metrics.cache.hitRate}`);

    lines.push('# HELP tourism_api_cache_size Current cache size');
    lines.push('# TYPE tourism_api_cache_size gauge');
    lines.push(`tourism_api_cache_size ${metrics.cache.size}`);

    // 비즈니스 메트릭
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
    // Node.js/Vercel 환경 - 기본 핸들러 내보내기
    module.exports = handler;

    // 추가 핸들러들 내보내기
    module.exports.handler = handler;
    module.exports.batchHandler = batchHandler;
    module.exports.metricsHandler = metricsHandler;
    module.exports.healthCheck = healthCheck;

    // API 클래스와 유틸리티들 내보내기
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
    // 브라우저 환경
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
        // 프로덕션에서는 프로세스 종료하지 않고 로깅만
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        // 프로덕션에서는 로깅만
    });

    // 우아한 종료 처리
    process.on('SIGTERM', () => {
        console.log('SIGTERM 신호 수신, 우아한 종료 시작...');
        // 여기서 정리 작업 수행
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log('SIGINT 신호 수신, 우아한 종료 시작...');
        // 여기서 정리 작업 수행
        process.exit(0);
    });
}

// ===== API 버전 정보 =====
const API_VERSION = '2.1.0';
const API_BUILD_DATE = new Date().toISOString();

// 버전 정보 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports.VERSION = API_VERSION;
    module.exports.BUILD_DATE = API_BUILD_DATE;
} else if (typeof window !== 'undefined') {
    window.TOURISM_API_VERSION = API_VERSION;
    window.TOURISM_API_BUILD_DATE = API_BUILD_DATE;
}

console.log(`🚀 All Tourism API v${API_VERSION} 로드 완료 (${new Date().toISOString()})`);














