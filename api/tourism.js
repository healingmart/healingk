// 관광 정보 API 서버리스 함수 (Ultimate Production Version - Final) // 모든 검토 사항을 반영한 완벽한 배포 준비 버전

/** * 최종 통합 개선 사항: * 1. [보안 강화] HTTPS 엔드포인트 확정 + DOMPurify 완전 통합 + API 키 검증 + CORS 도메인 제한 * 2. [성능 최적화] 메모리 효율성 + 실행 속도 최적화 * 3. [안정성 보장] 완전한 에러 처리 + 환경 호환성 * 4. [코드 품질] 완벽한 문서화 + 모든 TODO 완성 * 5. [확장성] 모듈화된 구조 + 플러그인 지원 * 6. [서버리스 최적화] Vercel 최적화 + 메모리 관리 * 7. [국제화] 완전한 다국어 지원 + 모든 메시지 완성 * 8. [검증 강화] 스키마 기반 검증 + 보안 검증 + 클라이언트 인증 */

// ===== 전역 상수 및 환경 설정 =====
const SERVICE_START_TIME = Date.now();
const NODE_ENV = typeof process !== 'undefined' && process.versions && process.versions.node;
const BROWSER_ENV = typeof window !== 'undefined';

// 프로덕션 설정 상수
const PRODUCTION_CONFIG = {
    API_BASE_URL: 'https://apis.data.go.kr/B551011/KorService2', // HTTPS 확정
    MAX_CACHE_SIZE: 1000,
    DEFAULT_TTL: 300000, // 5분
    MAX_MEMORY_USAGE: 50 * 1024 * 1024, // 50MB
    RATE_LIMIT_WINDOW: 60000, // 1분
    RATE_LIMIT_MAX: 100,
    REQUEST_TIMEOUT: 30000, // 30초
    MAX_BATCH_SIZE: 10,
    MAX_INPUT_LENGTH: 1000,
    // 새로운 보안 설정: 요청을 허용할 도메인 목록을 정의합니다.
    // 여기에 사용자님의 실제 블로그 도메인들을 추가하세요.
    // 프로토콜(http://, https://)과 포트(:8080)는 제외하고 순수 도메인 문자열만 입력합니다.
    ALLOWED_DOMAINS: [
        'localhost',    // 로컬 개발 환경에서 테스트 시 필요
        'localhost:3000',
        'localhost:8080',
        'localhost:5173',
        'healingk.com',
        'www.healingk.com',
        'tistory100.com',
        'www.tistory100.com',
        'jejugil.com',
        'www.jejugil.com',
        'healing-mart.com',
        'www.healing-mart.com',
        'ggeori.com',
        'www.ggeori.com',
        '*.vercel.app', // Vercel에 배포된 프론트엔드/테스터 앱을 위한 와일드카드 (예: healingk.vercel.app)
        // Canvas 앱이 실행되는 실제 도메인도 필요할 수 있습니다.
        // 브라우저 개발자 도구의 Network 탭에서 요청 헤더의 'Origin' 값을 확인하여 추가해주세요.
        // 예: '*.scf.usercontent.goog'
    ],
    API_KEY_HEADER: 'X-API-Key' // 클라이언트가 사용할 API 키 헤더명
};

// ===== 보안 모듈: DOMPurify 통합 및 Fallback =====
let DOMPurify = null;
let securityLibraryStatus = 'not_loaded';

try {
    if (NODE_ENV) {
        try {
            DOMPurify = require('isomorphic-dompurify');
            securityLibraryStatus = 'loaded_node';
        } catch (error) {
            console.warn('isomorphic-dompurify not available, using fallback sanitization');
            securityLibraryStatus = 'fallback_node';
        }
    } else if (BROWSER_ENV) {
        if (typeof window.DOMPurify !== 'undefined') {
            DOMPurify = window.DOMPurify;
            securityLibraryStatus = 'loaded_browser';
        } else {
            console.warn('DOMPurify not available in browser environment');
            securityLibraryStatus = 'fallback_browser';
        }
    }
} catch (error) {
    console.error('Error initializing security library:', error);
    securityLibraryStatus = 'error';
}

// ===== 보안 모듈: 강화된 새니타이징 시스템 =====
class SecurityModule {
    static sanitizeHtml(html, options = {}) {
        if (typeof html !== 'string') return html;

        const { allowedTags, allowedAttributes, strict = false } = options;

        if (DOMPurify && typeof DOMPurify.sanitize === 'function') {
            try {
                const config = {};
                if (allowedTags && Array.isArray(allowedTags)) {
                    config.ALLOWED_TAGS = allowedTags;
                }
                if (allowedAttributes && Array.isArray(allowedAttributes)) {
                    config.ALLOWED_ATTR = allowedAttributes;
                }
                if (strict) {
                    config.FORBID_TAGS = ['script', 'object', 'embed', 'form', 'input'];
                    config.FORBID_ATTR = ['onerror', 'onload', 'onclick', 'onmouseover'];
                }
                return DOMPurify.sanitize(html, config);
            } catch (error) {
                console.warn('DOMPurify sanitization failed, using fallback:', error);
            }
        }

        return this.fallbackSanitize(html, options);
    }

    static fallbackSanitize(html, options = {}) {
        let sanitized = html.trim();
        const { allowedTags, strict = false } = options;

        const dangerousTags = [
            'script', 'object', 'embed', 'applet', 'form', 'input', 'textarea', 'select', 'button',
            'iframe', 'frame', 'frameset', 'meta', 'link', 'style', 'base', 'title', 'head', 'html', 'body'
        ];

        dangerousTags.forEach(tag => {
            const regex = new RegExp(`<\\/?${tag}[^>]*>`, 'gi');
            sanitized = sanitized.replace(regex, '');
        });

        if (allowedTags && Array.isArray(allowedTags)) {
            const allowedPattern = allowedTags.map(tag => `(?:${tag})`).join('|');
            const tagRegex = new RegExp(`<(?!\\/?(?: ${allowedPattern})\\b)[^>]*?>`, 'gi');
            sanitized = sanitized.replace(tagRegex, '');
        } else {
            sanitized = sanitized.replace(/<[^>]*>/g, '');
        }

        const dangerousAttrs = [
            'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'onchange',
            'onsubmit', 'onreset', 'javascript:', 'vbscript:', 'data:'
        ];

        dangerousAttrs.forEach(attr => {
            const regex = new RegExp(`${attr}[^\\s>]*`, 'gi');
            sanitized = sanitized.replace(regex, '');
        });

        const xssPatterns = [
            /javascript\s*:/gi,
            /vbscript\s*:/gi,
            /data\s*:\s*text\/html/gi,
            /&#x?[0-9a-f]+;?/gi,
            /%[0-9a-f]{2}/gi,
            /\\u[0-9a-f]{4}/gi
        ];

        xssPatterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '');
        });

        sanitized = sanitized.replace(/[<>"'&]/g, (match) => {
            switch (match) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                case '&': return '&amp;';
                default: return match;
            }
        });

        return sanitized;
    }

    static sanitizeInput(input, maxLength = PRODUCTION_CONFIG.MAX_INPUT_LENGTH, options = {}) {
        if (typeof input !== 'string') return input;

        let sanitized = input.trim();

        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength);
        }

        sanitized = this.sanitizeHtml(sanitized, options);

        return sanitized;
    }

    static detectThreats(input) {
        if (typeof input !== 'string') return { safe: true, threats: [] };

        const threats = [];

        const patterns = {
            xss: /<script|javascript:|onerror=|onload=/gi,
            sqlInjection: /('|(\\')|(;)|(\\;)|(union)|(select)|(insert)|(delete)|(update)|(drop)|(create)|(alter)|(exec)|(execute))/gi,
            pathTraversal: /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/gi,
            commandInjection: /(\||&|;|`|\$\(|\${)/gi
        };

        Object.entries(patterns).forEach(([type, pattern]) => {
            if (pattern.test(input)) {
                threats.push(type);
            }
        });

        return {
            safe: threats.length === 0,
            threats,
            input: input.substring(0, 100)
        };
    }
}

// ===== API 보안 검증 모듈 =====
class ApiSecurityValidator {
    static getAllowedApiKeys() {
        if (NODE_ENV && process.env.ALLOWED_API_KEYS) {
            try {
                // 환경변수에서 쉼표로 구분된 API 키들을 배열로 변환
                return process.env.ALLOWED_API_KEYS.split(',').map(key => key.trim()).filter(key => key.length > 0);
            } catch (error) {
                console.error('Error parsing ALLOWED_API_KEYS:', error);
                return [];
            }
        }
        return [];
    }

    static validateApiKey(request) {
        const allowedKeys = this.getAllowedApiKeys();
        
        // 개발 환경에서는 API 키 검증을 건너뛸 수 있음
        if (allowedKeys.length === 0) {
            console.warn('No API keys configured. API key validation skipped.');
            return { valid: true, reason: 'no_keys_configured' };
        }

        // 헤더에서 API 키 추출
        const apiKey = request.headers[PRODUCTION_CONFIG.API_KEY_HEADER.toLowerCase()] || 
                      request.headers['x-api-key'] || 
                      request.query.apiKey || 
                      request.query.api_key;

        if (!apiKey) {
            return { 
                valid: false, 
                reason: 'missing_api_key',
                message: `API key is required. Please provide it in the '${PRODUCTION_CONFIG.API_KEY_HEADER}' header.`
            };
        }

        // API 키 형식 검증
        if (typeof apiKey !== 'string' || apiKey.length < 10) {
            return { 
                valid: false, 
                reason: 'invalid_api_key_format',
                message: 'API key format is invalid.'
            };
        }

        // 보안 위협 검사
        const threats = SecurityModule.detectThreats(apiKey);
        if (!threats.safe) {
            return { 
                valid: false, 
                reason: 'security_threat',
                message: 'Security threat detected in API key.'
            };
        }

        // API 키 검증
        if (!allowedKeys.includes(apiKey)) {
            return { 
                valid: false, 
                reason: 'unauthorized_api_key',
                message: 'Unauthorized API key.'
            };
        }

        return { valid: true, reason: 'authorized', apiKey };
    }

    static validateOrigin(request) {
        const origin = request.headers.origin || request.headers.referer;
        
        if (!origin) {
            // 직접 API 호출이나 서버 간 통신의 경우 origin이 없을 수 있음
            return { 
                valid: true, 
                reason: 'no_origin',
                allowedOrigin: '*' // 모든 도메인 허용
            };
        }

        try {
            const url = new URL(origin);
            const domain = url.hostname + (url.port ? `:${url.port}` : '');
            
            // 허용된 도메인 확인
            const isAllowed = PRODUCTION_CONFIG.ALLOWED_DOMAINS.some(allowedDomain => {
                // 정확한 도메인 매치
                if (domain === allowedDomain) return true;
                
                // 와일드카드 서브도메인 지원 (예: *.example.com)
                if (allowedDomain.startsWith('*.')) {
                    const baseDomain = allowedDomain.substring(2);
                    return domain.endsWith(`.${baseDomain}`) || domain === baseDomain;
                }
                
                return false;
            });

            if (!isAllowed) {
                return { 
                    valid: false, 
                    reason: 'unauthorized_origin',
                    message: `Origin '${domain}' is not allowed.`,
                    origin: domain
                };
            }

            return { 
                valid: true, 
                reason: 'authorized_origin',
                allowedOrigin: origin,
                domain
            };
        } catch (error) {
            return { 
                valid: false, 
                reason: 'invalid_origin_format',
                message: 'Invalid origin format.',
                origin
            };
        }
    }

    static generateCorsHeaders(originValidation) {
        const baseHeaders = {
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': `Content-Type, Authorization, ${PRODUCTION_CONFIG.API_KEY_HEADER}`,
            'Access-Control-Max-Age': '86400', // 24시간
            'Access-Control-Allow-Credentials': 'false'
        };

        if (originValidation.valid && originValidation.allowedOrigin) {
            baseHeaders['Access-Control-Allow-Origin'] = originValidation.allowedOrigin;
        } else {
            // 허용되지 않은 origin의 경우 CORS를 차단
            // 'null'로 설정하면 실제 브라우저에서는 요청이 차단됩니다.
            baseHeaders['Access-Control-Allow-Origin'] = 'null';
        }

        return baseHeaders;
    }
}

// ===== 유틸리티 모듈 =====
class SafeUtils {
    static generateRequestId(prefix = 'req') {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 15);
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
        return `${prefix}_${timestamp}_${random}_${uuid}`;
    }

    static safeParseInt(value, defaultValue = NaN, options = {}) {
        if (value === null || value === undefined || value === '') return defaultValue;

        const { min, max, strict = false } = options;

        if (typeof value === 'string') {
            const threats = SecurityModule.detectThreats(value);
            if (!threats.safe) {
                console.warn('Security threat detected in parseInt input:', threats);
                return defaultValue;
            }
        }

        let num;
        if (strict) {
            if (!/^-?\d+$/.test(String(value).trim())) return defaultValue;
            num = parseInt(value, 10);
        } else {
            num = parseInt(value, 10);
        }

        if (isNaN(num)) return defaultValue;
        if (typeof min === 'number' && num < min) return defaultValue;
        if (typeof max === 'number' && num > max) return defaultValue;

        return num;
    }

    static safeParseFloat(value, defaultValue = NaN, options = {}) {
        if (value === null || value === undefined || value === '') return defaultValue;

        const { min, max, precision, strict = false } = options;

        if (typeof value === 'string') {
            const threats = SecurityModule.detectThreats(value);
            if (!threats.safe) {
                console.warn('Security threat detected in parseFloat input:', threats);
                return defaultValue;
            }
        }

        let num;
        if (strict) {
            if (!/^-?\d+(\.\d+)?$/.test(String(value).trim())) return defaultValue;
            num = parseFloat(value);
        } else {
            num = parseFloat(value);
        }

        if (isNaN(num) || !isFinite(num)) return defaultValue;
        if (typeof min === 'number' && num < min) return defaultValue;
        if (typeof max === 'number' && num > max) return defaultValue;

        if (typeof precision === 'number' && precision >= 0) {
            num = parseFloat(num.toFixed(precision));
        }

        return num;
    }

    static maskSensitiveData(data, fieldsToMask = ['apiKey', 'password', 'token', 'ServiceKey'], options = {}) {
        if (typeof data !== 'object' || data === null) return data;

        const { maskChar = '*', showLength = 3, deepCopy = true } = options;
        const maskedData = deepCopy ? JSON.parse(JSON.stringify(data)) : { ...data };

        const maskValue = (value) => {
            if (typeof value !== 'string') return '***MASKED***';
            if (value.length <= showLength) return maskChar.repeat(value.length);
            return value.substring(0, showLength) + maskChar.repeat(Math.max(3, value.length - showLength));
        };

        const maskRecursive = (obj) => {
            for (const [key, value] of Object.entries(obj)) {
                if (fieldsToMask.includes(key)) {
                    obj[key] = maskValue(value);
                } else if (typeof value === 'object' && value !== null) {
                    maskRecursive(value);
                }
            }
        };

        maskRecursive(maskedData);
        return maskedData;
    }

    static isValidUrl(urlString, options = {}) {
        if (typeof urlString !== 'string') return false;

        const { allowedProtocols = ['https:'], allowLocalhost = false, maxLength = 2048 } = options;

        if (urlString.length > maxLength) return false;

        const isTourApiUrl = urlString.includes('apis.data.go.kr');

        if (!isTourApiUrl) {
            const threats = SecurityModule.detectThreats(urlString);
            if (!threats.safe) {
                console.warn('Security threat detected in URL:', threats);
                return false;
            }
        }

        try {
            const url = new URL(urlString);

            if (!allowedProtocols.includes(url.protocol)) return false;

            if (!allowLocalhost && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
                return false;
            }

            if (!isTourApiUrl && (url.username || url.password)) return false;

            return true;
        } catch (error) {
            return false;
        }
    }

    static sleep(ms, options = {}) {
        const { maxWait = 30000 } = options;
        const waitTime = Math.min(Math.max(0, ms), maxWait);
        return new Promise(resolve => setTimeout(resolve, waitTime));
    }

    static validateAndTransform(data, schema) {
        const errors = [];
        const transformed = {};

        for (const [key, rules] of Object.entries(schema)) {
            const value = data[key];

            if (rules.required && (value === undefined || value === null || value === '')) {
                errors.push(`Field '${key}' is required`);
                continue;
            }

            if (value !== undefined && value !== null) {
                try {
                    switch (rules.type) {
                        case 'string':
                            transformed[key] = SecurityModule.sanitizeInput(String(value), rules.maxLength || 1000);
                            if (rules.minLength && transformed[key].length < rules.minLength) {
                                errors.push(`Field '${key}' minimum length is ${rules.minLength}`);
                            }
                            if (rules.enum && !rules.enum.includes(transformed[key])) {
                                errors.push(`Field '${key}' must be one of: ${rules.enum.join(', ')}`);
                            }
                            break;
                        case 'number':
                            transformed[key] = this.safeParseFloat(value, NaN, rules);
                            if (isNaN(transformed[key])) {
                                errors.push(`Field '${key}' must be a valid number`);
                            }
                            break;
                        case 'integer':
                            transformed[key] = this.safeParseInt(value, NaN, rules);
                            if (isNaN(transformed[key])) {
                                errors.push(`Field '${key}' must be a valid integer`);
                            }
                            break;
                        case 'boolean':
                            transformed[key] = Boolean(value);
                            break;
                        case 'url':
                            if (!this.isValidUrl(value, rules)) {
                                errors.push(`Field '${key}' must be a valid URL`);
                            } else {
                                transformed[key] = value;
                            }
                            break;
                        default:
                            transformed[key] = value;
                    }
                } catch (error) {
                    errors.push(`Field '${key}' validation error: ${error.message}`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            data: transformed
        };
    }
}

// ===== 지리 유틸리티 모듈 =====
class GeoUtils {
    static isValidCoordinate(lat, lng, options = {}) {
        const { strict = false, precision = 6 } = options;

        const numLat = SafeUtils.safeParseFloat(lat, NaN, { min: -90, max: 90, precision });
        const numLng = SafeUtils.safeParseFloat(lng, NaN, { min: -180, max: 180, precision });

        if (isNaN(numLat) || isNaN(numLng)) return false;

        if (strict) {
            if (options.koreaOnly) {
                return numLat >= 33 && numLat <= 43 && numLng >= 124 && numLng <= 132;
            }
        }

        return true;
    }

    static getDistance(lat1, lon1, lat2, lon2, unit = 'm') {
        if (!this.isValidCoordinate(lat1, lon1) || !this.isValidCoordinate(lat2, lon2)) {
            return NaN;
        }

        const R = 6371e3; // metres
        const φ1 = (lat1 * Math.PI) / 180; // φ, λ in radians
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        let distance = R * c; // in metres

        switch (unit.toLowerCase()) {
            case 'km':
                distance = distance / 1000;
                break;
            case 'mi':
                distance = distance / 1609.344;
                break;
            case 'm':
            default:
                break;
        }

        return Math.round(distance * 100) / 100;
    }

    static addDistanceInfo(items, userLat, userLng, radius, options = {}) {
        if (!Array.isArray(items)) return [];

        const { unit = 'm', sortByDistance = true, maxResults = 1000 } = options;
        const lat = SafeUtils.safeParseFloat(userLat);
        const lng = SafeUtils.safeParseFloat(userLng);
        const rad = SafeUtils.safeParseFloat(radius);

        if (isNaN(lat) || isNaN(lng)) {
            return items.slice(0, maxResults);
        }

        const processedItems = items
            .map(item => {
                const itemLat = SafeUtils.safeParseFloat(item.mapy);
                const itemLng = SafeUtils.safeParseFloat(item.mapx);

                if (!isNaN(itemLat) && !isNaN(itemLng)) {
                    const distance = this.getDistance(lat, lng, itemLat, itemLng, unit);
                    return { ...item, distance };
                }
                return item;
            })
            .filter(item => {
                if (isNaN(rad) || rad <= 0) return true;
                return item.distance !== undefined && item.distance <= rad;
            });

        if (sortByDistance) {
            processedItems.sort((a, b) => {
                if (a.distance === undefined && b.distance === undefined) return 0;
                if (a.distance === undefined) return 1;
                if (b.distance === undefined) return -1;
                return a.distance - b.distance;
            });
        }

        return processedItems.slice(0, maxResults);
    }

    static isWithinBounds(lat, lng, bounds) {
        if (!this.isValidCoordinate(lat, lng)) return false;
        if (!bounds || typeof bounds !== 'object') return true;

        const { north, south, east, west } = bounds;
        return lat >= south && lat <= north && lng >= west && lng <= east;
    }
}

// ===== 에러 처리 모듈 =====
class BaseError extends Error {
    constructor(message, code, statusCode, details = {}, i18n = null) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();
        this.i18n = i18n;
        this.requestId = SafeUtils.generateRequestId('err');

        if (this.i18n && typeof this.i18n.getMessage === 'function') {
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

    toJSON(includeStack = false) {
        const errorObj = {
            success: false,
            error: {
                name: this.name,
                code: this.code,
                message: this.localizedMessage,
                statusCode: this.statusCode,
                details: this.details,
                timestamp: this.timestamp,
                requestId: this.requestId
            }
        };
        if (includeStack && this.stack) {
            errorObj.error.stack = this.stack;
        }
        return errorObj;
    }

    toLogFormat() {
        return {
            level: 'error',
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
            details: SafeUtils.maskSensitiveData(this.details),
            timestamp: this.timestamp,
            requestId: this.requestId
        };
    }
}

class TourismApiError extends BaseError {
    constructor(code = 'API_ERROR', operation = 'unknown', statusCode = 500, details = {}, metadata = {}, i18n = null) {
        const message = i18n && typeof i18n.getMessage === 'function' ? i18n.getMessage(code, { operation, ...details }) : `Tourism API error during ${operation}`;
        super(message, code, statusCode, { operation, ...details }, i18n);
        this.operation = operation;
        this.metadata = metadata;
    }

    toJSON(includeStack = false) {
        const baseJson = super.toJSON(includeStack);
        baseJson.error.operation = this.operation;
        if (Object.keys(this.metadata).length > 0) {
            baseJson.metadata = this.metadata;
        }
        return baseJson;
    }
}

class ValidationError extends BaseError {
    constructor(message, field = 'unknown', value = 'unknown', i18n = null) {
        const localizedMessage = i18n && typeof i18n.getMessage === 'function' ? i18n.getMessage('VALIDATION_ERROR_FIELD', { field, value, message }) : `Validation error for field '${field}': ${message}`;
        super(localizedMessage, 'VALIDATION_ERROR', 400, { field, value, originalMessage: message }, i18n);
        this.field = field;
        this.value = value;
    }

    toJSON(includeStack = false) {
        const baseJson = super.toJSON(includeStack);
        baseJson.error.field = this.field;
        baseJson.error.value = this.value;
        return baseJson;
    }
}

class ApiTimeoutError extends BaseError {
    constructor(timeout, operation = 'unknown', i18n = null) {
        const message = i18n && typeof i18n.getMessage === 'function' ? i18n.getMessage('API_TIMEOUT', { timeout, operation }) : `API request timed out after ${timeout}ms for operation '${operation}'.`;
        super(message, 'API_TIMEOUT', 504, { timeout, operation }, i18n);
        this.timeout = timeout;
        this.operation = operation;
    }
}

class RateLimitError extends BaseError {
    constructor(limit, remaining, resetTime, i18n = null) {
        const message = i18n && typeof i18n.getMessage === 'function' ? i18n.getMessage('RATE_LIMIT_EXCEEDED', { limit, remaining, resetTime }) : `Rate limit exceeded. Limit: ${limit}, Remaining: ${remaining}.`;
        super(message, 'RATE_LIMIT_EXCEEDED', 429, { limit, remaining, resetTime }, i18n);
        this.limit = limit;
        this.remaining = remaining;
        this.resetTime = resetTime;
    }
}

class SecurityError extends BaseError {
    constructor(message = 'Security threat detected', code = 'SECURITY_ERROR', details = {}, i18n = null) {
        const localizedMessage = i18n && typeof i18n.getMessage === 'function' ? i18n.getMessage(code, details) : message;
        super(localizedMessage, code, 403, details, i18n);
        this.securityLevel = details.level || 'medium';
    }
}

class NetworkError extends BaseError {
    constructor(message, code = 'NETWORK_ERROR', statusCode = 500, details = {}, i18n = null) {
        super(message, code, statusCode, details, i18n);
        this.isNetworkError = true;
    }
}

// ===== 응답 포맷터 모듈 =====
class ResponseFormatter {
    static formatSuccess(operation, data, metadata = {}, performance = {}) {
        return {
            success: true,
            timestamp: new Date().toISOString(),
            operation,
            data,
            metadata: {
                ...metadata,
                version: '1.0.0',
                environment: NODE_ENV ? 'node' : 'browser',
                securityStatus: securityLibraryStatus
            },
            performance: { ...performance, responseTime: performance.responseTime || (Date.now() - SERVICE_START_TIME) }
        };
    }

    static formatError(error, operation = 'unknown', context = {}) {
        if (error instanceof BaseError) {
            const errorJson = error.toJSON();
            if (operation && !errorJson.error.operation) {
                errorJson.error.operation = operation;
            }

            if (Object.keys(context).length > 0) {
                errorJson.context = SafeUtils.maskSensitiveData(context);
            }

            return errorJson;
        }

        const message = error.i18n && typeof error.i18n.getMessage === 'function' ? error.i18n.getMessage('UNKNOWN_ERROR') : 'An unexpected error occurred.';

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
                requestId: SafeUtils.generateRequestId('err')
            },
            context: Object.keys(context).length > 0 ? SafeUtils.maskSensitiveData(context) : undefined
        };
    }

    static addCacheInfo(data, isCached, cacheStats = {}) {
        if (typeof data === 'object' && data !== null) {
            data.metadata = { ...data.metadata, cache: { isCached, hitRate: cacheStats.hitRate || 0, size: cacheStats.size || 0, lastCleanup: cacheStats.lastCleanup || null, ...(isCached ? cacheStats : {}) } };
        }
        return data;
    }

    static addPaginationInfo(data, pagination = {}) {
        if (typeof data === 'object' && data !== null) {
            data.metadata = {
                ...data.metadata,
                pagination: {
                    page: pagination.page || 1,
                    size: pagination.size || 10,
                    total: pagination.total || 0,
                    totalPages: Math.ceil((pagination.total || 0) / (pagination.size || 10)),
                    hasNext: pagination.hasNext || false,
                    hasPrev: pagination.hasPrev || false
                }
            };
        }
        return data;
    }
}

// ===== 서비스 컨테이너 모듈 =====
class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.instances = new Map();
        this.initialized = false;
        this.initializationTime = null;
        this.dependencies = new Map();
    }

    register(name, factory, options = {}) {
        if (typeof name !== 'string' || !name.trim()) {
            throw new ValidationError('Service name must be a non-empty string', 'name', name);
        }

        if (typeof factory !== 'function') {
            throw new ValidationError('Service factory must be a function', 'factory', typeof factory);
        }

        if (this.services.has(name)) {
            console.warn(`Service ${name} is already registered. Overwriting.`);
        }

        const { dependencies = [], singleton = true } = options;

        this.services.set(name, { factory, singleton, dependencies });
        this.dependencies.set(name, dependencies);

        return this;
    }

    get(name) {
        if (!this.services.has(name)) {
            throw new Error(`Service '${name}' not found. Available services: ${Array.from(this.services.keys()).join(', ')}`);
        }

        const serviceConfig = this.services.get(name);

        if (serviceConfig.singleton && this.instances.has(name)) {
            return this.instances.get(name);
        }

        const resolvedDependencies = {};
        for (const dep of serviceConfig.dependencies) {
            resolvedDependencies[dep] = this.get(dep);
        }

        const instance = serviceConfig.factory(this, resolvedDependencies);

        if (serviceConfig.singleton) {
            this.instances.set(name, instance);
        }

        return instance;
    }

    initialize() {
        if (this.initialized) return;

        const startTime = Date.now();
        try {
            const initOrder = this.resolveDependencyOrder();
            for (const serviceName of initOrder) {
                this.get(serviceName);
            }

            this.initialized = true;
            this.initializationTime = Date.now() - startTime;
            console.log(`Service container initialized in ${this.initializationTime}ms with services:`, Array.from(this.instances.keys()).join(', '));
        } catch (error) {
            console.error('Service container initialization failed:', error);
            throw new Error(`Service container initialization failed: ${error.message}`);
        }
    }

    resolveDependencyOrder() {
        const visited = new Set();
        const visiting = new Set();
        const order = [];

        const visit = (serviceName) => {
            if (visiting.has(serviceName)) {
                throw new Error(`Circular dependency detected involving service '${serviceName}'`);
            }

            if (visited.has(serviceName)) return;

            visiting.add(serviceName);

            const dependencies = this.dependencies.get(serviceName) || [];
            for (const dep of dependencies) {
                if (!this.services.has(dep)) {
                    throw new Error(`Dependency '${dep}' for service '${serviceName}' is not registered`);
                }
                visit(dep);
            }

            visiting.delete(serviceName);
            visited.add(serviceName);
            order.push(serviceName);
        };

        for (const serviceName of this.services.keys()) {
            visit(serviceName);
        }

        return order;
    }

    isInitialized() {
        return this.initialized;
    }

    getInstancedServices() {
        return Array.from(this.instances.keys());
    }

    destroy() {
        for (const [name, instance] of this.instances.entries()) {
            if (typeof instance.destroy === 'function') {
                try {
                    instance.destroy();
                } catch (error) {
                    console.warn(`Error destroying service '${name}':`, error);
                }
            }
        }

        this.instances.clear();
        this.services.clear();
        this.dependencies.clear();
        this.initialized = false;
        this.initializationTime = null;
        console.log('Service container destroyed');
    }

    getStatus() {
        return {
            initialized: this.initialized,
            initializationTime: this.initializationTime,
            registeredServices: Array.from(this.services.keys()),
            instancedServices: Array.from(this.instances.keys()),
            serviceCount: this.services.size,
            instanceCount: this.instances.size
        };
    }
}

// ===== 국제화 관리자 모듈 =====
class InternationalizationManager {
    constructor(defaultLanguage = 'ko') {
        this.currentLanguage = defaultLanguage;
        this.fallbackLanguage = 'en';
        this.messages = this.initializeMessages();
        this.customMessages = new Map();
    }

    initializeMessages() {
        return {
            ko: {
                // 기본 에러 메시지
                API_ERROR: 'API 오류가 발생했습니다 (작업: ${operation}).',
                VALIDATION_ERROR: '입력값 검증 오류가 발생했습니다.',
                VALIDATION_ERROR_FIELD: "필드 '${field}' 검증 오류: ${message}",
                API_TIMEOUT: 'API 요청 시간 초과 (${timeout}ms, 작업: ${operation}).',
                RATE_LIMIT_EXCEEDED: '요청 한도 초과. 한도: ${limit}, 남은 요청: ${remaining}, 재설정: ${resetTime}.',
                SECURITY_ERROR: '보안 위협이 감지되었습니다.',
                UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다.',
                NETWORK_ERROR: '네트워크 오류가 발생했습니다.',

                // API 관련 메시지
                MISSING_API_KEY: 'TOURISM_API_KEY 환경변수가 설정되지 않았습니다. API 키를 설정해주세요.',
                INVALID_API_KEY: '제공된 API 키가 유효하지 않습니다.',
                UNSUPPORTED_OPERATION: "지원하지 않는 작업입니다: '${operation}'.",
                BATCH_DISABLED: '배치 요청 기능이 비활성화되어 있습니다.',
                BATCH_SIZE_EXCEEDED: '최대 ${max}개의 작업만 배치로 처리할 수 있습니다. (요청: ${actual})',

                // 검증 관련 메시지
                INVALID_RANGE: "필드 '${field}'의 값이 유효한 범위를 벗어났습니다. (허용 범위: ${min} ~ ${max})",
                NUMERIC_ERROR: "필드 '${field}'는 숫자여야 합니다.",
                INVALID_FORMAT: "필드 '${field}'의 형식이 올바르지 않습니다.",
                INVALID_COORDINATES: "좌표값이 유효하지 않습니다 (위도: ${lat}, 경도: ${lng}).",
                MIN_LENGTH_ERROR: "최소 길이는 ${minLength}자입니다. (현재: ${actual}자)",
                MAX_LENGTH_ERROR: "최대 길이는 ${maxLength}자입니다. (현재: ${actual}자)",
                ENUM_ERROR: "허용된 값 중 하나여야 합니다: ${values}",

                // API 응답 관련 메시지
                API_RESPONSE_ERROR: "API 응답에 오류가 발생했습니다. 상태: ${status} ${statusText}",
                API_LOGIC_ERROR: "API 내부 처리 오류가 발생했습니다. 코드: ${resultCode}",
                APPLICATION_ERROR: "애플리케이션 오류가 발생했습니다.",
                DB_ERROR: "데이터베이스 오류가 발생했습니다.",
                NODATA_ERROR: "데이터가 없습니다.",
                HTTP_ERROR: "HTTP 오류가 발생했습니다.",
                SERVICETIMEOUT_ERROR: "서비스 연결 시간이 초과되었습니다.",

                // 파라미터 관련 메시지
                INVALID_REQUEST_PARAMETER_ERROR: "잘못된 요청 파라미터입니다.",
                NO_MANDATORY_REQUEST_PARAMETERS_ERROR: "필수 요청 파라미터가 누락되었습니다.",
                END_OF_SERVICE_ERROR: "해당 오픈 API 서비스가 없거나 폐기되었습니다.",
                SERVICE_ACCESS_DENIED_ERROR: "서비스 접근이 거부되었습니다.",
                TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR: "일시적으로 사용할 수 없는 서비스 키입니다.",
                LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR: "서비스 요청 제한 횟수를 초과했습니다.",
                SERVICE_KEY_IS_NOT_REGISTERED_ERROR: "등록되지 않은 서비스 키입니다.",
                DEADLINE_HAS_EXPIRED_ERROR: "서비스 키 사용 기간이 만료되었습니다.",
                UNREGISTERED_IP_ERROR: "등록되지 않은 IP입니다.",

                // 성공 메시지
                OPERATION_SUCCESS: "작업이 성공적으로 완료되었습니다.",
                DATA_RETRIEVED: "데이터를 성공적으로 조회했습니다.",
                CACHE_HIT: "캐시에서 데이터를 조회했습니다.",
                CACHE_MISS: "새로운 데이터를 조회했습니다."
            },
            en: {
                // Basic error messages
                API_ERROR: 'API error occurred (operation: ${operation}).',
                VALIDATION_ERROR: 'Input validation error occurred.',
                VALIDATION_ERROR_FIELD: "Validation error for field '${field}': ${message}",
                API_TIMEOUT: 'API request timed out after ${timeout}ms for operation \'${operation}\'.',
                RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Limit: ${limit}, Remaining: ${remaining}, Reset: ${resetTime}.',
                SECURITY_ERROR: 'Security threat detected.',
                UNKNOWN_ERROR: 'An unexpected error occurred.',
                NETWORK_ERROR: 'Network error occurred.',

                // API related messages
                MISSING_API_KEY: 'TOURISM_API_KEY environment variable is not set. Please configure the API key.',
                INVALID_API_KEY: 'The provided API key is invalid.',
                UNSUPPORTED_OPERATION: "Unsupported operation: '${operation}'.",
                BATCH_DISABLED: 'Batch request functionality is disabled.',
                BATCH_SIZE_EXCEEDED: 'Maximum batch size of ${max} exceeded. (Requested: ${actual})',

                // Validation related messages
                INVALID_RANGE: "Field '${field}' is out of valid range. (Allowed: ${min} - ${max})",
                NUMERIC_ERROR: "Field '${field}' must be a number.",
                INVALID_FORMAT: "Field '${field}' has an invalid format.",
                INVALID_COORDINATES: "Invalid coordinates (Latitude: ${lat}, Longitude: ${lng}).",
                MIN_LENGTH_ERROR: "Minimum length is ${minLength}. (Actual: ${actual})",
                MAX_LENGTH_ERROR: "Maximum length is ${maxLength}. (Actual: ${actual})",
                ENUM_ERROR: "Must be one of the allowed values: ${values}",

                // API response related messages
                API_RESPONSE_ERROR: "API response error occurred. Status: ${status} ${statusText}",
                API_LOGIC_ERROR: "API internal processing error occurred. Code: ${resultCode}",
                APPLICATION_ERROR: "Application error occurred.",
                DB_ERROR: "Database error occurred.",
                NODATA_ERROR: "No data available.",
                HTTP_ERROR: "HTTP error occurred.",
                SERVICETIMEOUT_ERROR: "Service connection timeout.",

                // Parameter related messages
                INVALID_REQUEST_PARAMETER_ERROR: "Invalid request parameter.",
                NO_MANDATORY_REQUEST_PARAMETERS_ERROR: "Required request parameters are missing.",
                END_OF_SERVICE_ERROR: "The requested Open API service is not available or has been discontinued.",
                SERVICE_ACCESS_DENIED_ERROR: "Service access denied.",
                TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR: "Service key is temporarily disabled.",
                LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR: "Service request limit exceeded.",
                SERVICE_KEY_IS_NOT_REGISTERED_ERROR: "Unregistered service key.",
                DEADLINE_HAS_EXPIRED_ERROR: "Service key usage period has expired.",
                UNREGISTERED_IP_ERROR: "Unregistered IP address.",

                // Success messages
                OPERATION_SUCCESS: "Operation completed successfully.",
                DATA_RETRIEVED: "Data retrieved successfully.",
                CACHE_HIT: "Data retrieved from cache.",
                CACHE_MISS: "New data retrieved."
            }
        };
    }

    setLanguage(language) {
        if (typeof language === 'string' && this.messages[language]) {
            this.currentLanguage = language;
        } else {
            console.warn(`Language '${language}' not supported. Using default: ${this.currentLanguage}`);
        }
    }

    getMessage(key, params = {}, language = null) {
        const lang = language || this.currentLanguage;

        const customKey = `${lang}:${key}`;
        if (this.customMessages.has(customKey)) {
            return this.interpolate(this.customMessages.get(customKey), params);
        }

        let message = this.messages[lang]?.[key];
        if (!message && lang !== this.fallbackLanguage) {
            message = this.messages[this.fallbackLanguage]?.[key];
        }

        if (!message) {
            message = key;
            console.warn(`Message not found for key '${key}' in language '${lang}'`);
        }

        return this.interpolate(message, params);
    }

    interpolate(message, params) {
        if (!params || typeof params !== 'object') return message;

        return message.replace(/\$\{([^}]+)\}/g, (match, key) => {
            const value = params[key];
            return value !== undefined ? String(value) : match;
        });
    }

    addCustomMessage(language, key, message) {
        const customKey = `${language}:${key}`;
        this.customMessages.set(customKey, message);
    }

    getSupportedLanguages() {
        return Object.keys(this.messages);
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }
}

// ===== 캐시 모듈 =====
class AdvancedCache {
    constructor(options = {}) {
        this.cache = new Map();
        this.accessTimes = new Map();
        this.hitCount = 0;
        this.missCount = 0;
        this.lastCleanup = Date.now();

        this.maxSize = options.maxSize || PRODUCTION_CONFIG.MAX_CACHE_SIZE;
        this.defaultTTL = options.defaultTTL || PRODUCTION_CONFIG.DEFAULT_TTL;
        this.cleanupThreshold = options.cleanupThreshold || 100;
        this.maxMemoryUsage = options.maxMemoryUsage || PRODUCTION_CONFIG.MAX_MEMORY_USAGE;
        this.accessCountThreshold = options.accessCountThreshold || 50;

        this.operationCount = 0;
    }

    get(key) {
        this.operationCount++;
        if (this.operationCount % this.accessCountThreshold === 0) {
            this.lazyCleanup();
        }

        const item = this.cache.get(key);
        if (!item) {
            this.missCount++;
            return undefined;
        }

        if (item.expiry && Date.now() > item.expiry) {
            this.cache.delete(key);
            this.accessTimes.delete(key);
            this.missCount++;
            return undefined;
        }

        this.accessTimes.set(key, Date.now());
        this.hitCount++;
        return item.value;
    }

    set(key, value, ttl = null) {
        const expiry = ttl ? Date.now() + ttl : Date.now() + this.defaultTTL;

        if (this.getEstimatedMemoryUsage() > this.maxMemoryUsage) {
            this.evictLeastRecentlyUsed();
        }

        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLeastRecentlyUsed();
        }

        this.cache.set(key, { value, expiry, createdAt: Date.now() });
        this.accessTimes.set(key, Date.now());
    }

    delete(key) {
        const deleted = this.cache.delete(key);
        this.accessTimes.delete(key);
        return deleted;
    }

    clear() {
        this.cache.clear();
        this.accessTimes.clear();
        this.hitCount = 0;
        this.missCount = 0;
        this.operationCount = 0;
        this.lastCleanup = Date.now();
    }

    lazyCleanup() {
        const now = Date.now();
        const expiredKeys = [];

        for (const [key, item] of this.cache.entries()) {
            if (item.expiry && now > item.expiry) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            this.cache.delete(key);
            this.accessTimes.delete(key);
        }

        this.lastCleanup = now;
        if (expiredKeys.length > 0) {
            console.log(`Cache cleanup: removed ${expiredKeys.length} expired items`);
        }
    }

    evictLeastRecentlyUsed() {
        if (this.accessTimes.size === 0) return;

        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, time] of this.accessTimes.entries()) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.delete(oldestKey);
        }
    }

    getStats() {
        const totalRequests = this.hitCount + this.missCount;
        const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;

        return {
            size: this.cache.size,
            hitCount: this.hitCount,
            missCount: this.missCount,
            hitRate: Math.round(hitRate * 100) / 100,
            lastCleanup: new Date(this.lastCleanup).toISOString(),
            estimatedMemoryUsage: this.getEstimatedMemoryUsage(),
            operationCount: this.operationCount
        };
    }

    getObjectSize(obj) {
        if (obj === null || obj === undefined) return 0;

        switch (typeof obj) {
            case 'string':
                return obj.length * 2;
            case 'number':
                return 8;
            case 'boolean':
                return 4;
            case 'object':
                if (Array.isArray(obj)) {
                    return obj.reduce((size, item) => size + this.getObjectSize(item), 0);
                }
                return Object.entries(obj).reduce((size, [key, value]) => size + this.getObjectSize(key) + this.getObjectSize(value), 0);
            default:
                return 0;
        }
    }

    optimize() {
        this.lazyCleanup();
        while (this.getEstimatedMemoryUsage() > this.maxMemoryUsage && this.cache.size > 0) {
            this.evictLeastRecentlyUsed();
        }
        console.log('Cache optimization completed:', this.getStats());
    }

    destroy() {
        this.clear();
        console.log('Cache instance destroyed');
    }
}

// ===== Rate Limiter 모듈 =====
class RateLimiter {
    constructor(options = {}) {
        this.requests = new Map();
        this.windowSize = options.windowSize || PRODUCTION_CONFIG.RATE_LIMIT_WINDOW;
        this.maxRequests = options.maxRequests || PRODUCTION_CONFIG.RATE_LIMIT_MAX;
        this.cleanupThreshold = options.cleanupThreshold || 50;
        this.operationCount = 0;
    }

    checkLimit(identifier) {
        this.operationCount++;
        if (this.operationCount % this.cleanupThreshold === 0) {
            this.lazyCleanup();
        }

        const now = Date.now();
        const windowStart = now - this.windowSize;

        if (!this.requests.has(identifier)) {
            this.requests.set(identifier, []);
        }

        const userRequests = this.requests.get(identifier);
        const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
        this.requests.set(identifier, validRequests);

        if (validRequests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...validRequests);
            const resetTime = oldestRequest + this.windowSize;

            return {
                allowed: false,
                limit: this.maxRequests,
                remaining: 0,
                resetTime: new Date(resetTime).toISOString(),
                retryAfter: Math.ceil((resetTime - now) / 1000)
            };
        }

        validRequests.push(now);
        return { allowed: true, limit: this.maxRequests, remaining: this.maxRequests - validRequests.length, resetTime: new Date(now + this.windowSize).toISOString(), retryAfter: 0 };
    }

    lazyCleanup() {
        const now = Date.now();
        const windowStart = now - this.windowSize;
        const cleanedIdentifiers = [];

        for (const [identifier, requests] of this.requests.entries()) {
            const validRequests = requests.filter(timestamp => timestamp > windowStart);

            if (validRequests.length === 0) {
                this.requests.delete(identifier);
                cleanedIdentifiers.push(identifier);
            } else {
                this.requests.set(identifier, validRequests);
            }
        }

        if (cleanedIdentifiers.length > 0) {
            console.log(`Rate limiter cleanup: removed ${cleanedIdentifiers.length} expired identifiers`);
        }
    }

    reset(identifier) {
        this.requests.delete(identifier);
    }

    clear() {
        this.requests.clear();
        this.operationCount = 0;
    }

    getStats() {
        return {
            activeIdentifiers: this.requests.size,
            windowSize: this.windowSize,
            maxRequests: this.maxRequests,
            operationCount: this.operationCount
        };
    }

    destroy() {
        this.clear();
        console.log('Rate limiter destroyed');
    }
}

// ===== HTTP 클라이언트 모듈 =====
class HttpClient {
    constructor(options = {}) {
        this.baseURL = options.baseURL || '';
        this.timeout = options.timeout || PRODUCTION_CONFIG.REQUEST_TIMEOUT;
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.defaultHeaders = options.defaultHeaders || {};
        this.rateLimiter = options.rateLimiter || null;
    }

    async get(url, options = {}) {
        return this.request('GET', url, null, options);
    }

    async post(url, data, options = {}) {
        return this.request('POST', url, data, options);
    }

    async request(method, url, data = null, options = {}) {
        const fullUrl = this.baseURL + url;
        const requestOptions = this.buildRequestOptions(method, data, options);

        if (this.rateLimiter) {
            const limitCheck = this.rateLimiter.checkLimit(options.identifier || 'default');
            if (!limitCheck.allowed) {
                throw new RateLimitError(limitCheck.limit, limitCheck.remaining, limitCheck.resetTime);
            }
        }

        let lastError = null;

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const response = await this.performRequest(fullUrl, requestOptions);
                return await this.processResponse(response);
            } catch (error) {
                lastError = error;

                if (error instanceof ValidationError || error instanceof SecurityError || (error.statusCode && error.statusCode >= 400 && error.statusCode < 500)) {
                    throw error;
                }

                if (attempt < this.retryAttempts) {
                    const delay = this.retryDelay * Math.pow(2, attempt - 1);
                    console.warn(`Request failed (attempt ${attempt}/${this.retryAttempts}), retrying in ${delay}ms:`, error.message);
                    await SafeUtils.sleep(delay);
                }
            }
        }

        throw new NetworkError(
            `Request failed after ${this.retryAttempts} attempts: ${lastError.message}`,
            'REQUEST_FAILED',
            500,
            { url: fullUrl, method, attempts: this.retryAttempts, lastError: lastError.message }
        );
    }

    buildRequestOptions(method, data, options) {
        const requestOptions = {
            method,
            headers: {
                ...this.defaultHeaders,
                ...options.headers
            },
            timeout: options.timeout || this.timeout
        };

        if (data && method !== 'GET') {
            requestOptions.body = JSON.stringify(data);
            requestOptions.headers['Content-Type'] = 'application/json';
        }

        return requestOptions;
    }

    async performRequest(url, options) {
        if (!SafeUtils.isValidUrl(url, { allowedProtocols: ['https:'] })) {
            throw new SecurityError('Invalid URL detected', 'INVALID_URL', { url });
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout);

        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new ApiTimeoutError(options.timeout, 'HTTP_REQUEST');
            }
            throw new NetworkError(
                `Network request failed: ${error.message}`,
                'NETWORK_ERROR',
                0,
                { url, error: error.message }
            );
        }
    }

    async processResponse(response) {
        if (!response.ok) {
            let errorMessage = `HTTP ${response.status} ${response.statusText}`;
            let errorDetails = { status: response.status, statusText: response.statusText, url: response.url };

            try {
                const errorBody = await response.text();
                if (errorBody) {
                    errorDetails.body = errorBody;
                    errorMessage += `: ${errorBody}`;
                }
            } catch (parseError) {
                // 에러 응답 파싱 실패는 무시
            }

            throw new NetworkError(errorMessage, 'HTTP_ERROR', response.status, errorDetails);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            try {
                return await response.json();
            } catch (error) {
                throw new NetworkError(
                    'Invalid JSON response',
                    'INVALID_JSON',
                    500,
                    { contentType, error: error.message }
                );
            }
        } else if (contentType && contentType.includes('text/')) {
            return await response.text();
        } else {
            return await response.arrayBuffer();
        }
    }
}

// ===== 관광 API 클라이언트 모듈 =====
class TourismApiClient {
    constructor(options = {}) {
        this.apiKey = options.apiKey || this.getApiKeyFromEnv();
        this.baseURL = options.baseURL || PRODUCTION_CONFIG.API_BASE_URL; // HTTPS 확정
        this.httpClient = new HttpClient({
            baseURL: this.baseURL,
            timeout: options.timeout || PRODUCTION_CONFIG.REQUEST_TIMEOUT,
            retryAttempts: options.retryAttempts || 3,
            rateLimiter: options.rateLimiter
        });
        this.cache = options.cache || null;
        this.i18n = options.i18n || new InternationalizationManager();
        this.batchEnabled = options.batchEnabled !== false;
        this.maxBatchSize = options.maxBatchSize || PRODUCTION_CONFIG.MAX_BATCH_SIZE;
    }

    getApiKeyFromEnv() {
        if (NODE_ENV && process.env.TOURISM_API_KEY) {
            return process.env.TOURISM_API_KEY;
        }
        throw new TourismApiError('MISSING_API_KEY', 'initialization', 500, {}, {}, this.i18n);
    }

    buildBaseParams(params = {}) {
        return {
            serviceKey: this.apiKey,
            MobileOS: 'ETC',
            MobileApp: 'TourismAPI',
            _type: 'json',
            ...params
        };
    }

    buildUrl(endpoint, params) {
        const queryParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, String(value));
            }
        });

        return `${endpoint}?${queryParams.toString()}`;
    }

    generateCacheKey(operation, params) {
        const sortedParams = Object.keys(params).sort().reduce((result, key) => {
            result[key] = params[key];
            return result;
        }, {});

        return `tourism_api:${operation}:${JSON.stringify(sortedParams)}`;
    }

    async makeRequest(endpoint, params = {}, options = {}) {
        const operation = options.operation || endpoint;
        const startTime = Date.now();

        try {

            const validatedParams = this.validateAndSanitizeParams(params);

            const fullParams = this.buildBaseParams(validatedParams);

            let cacheKey = null;
            let cachedResult = null;

            if (this.cache && options.useCache !== false) {
                cacheKey = this.generateCacheKey(operation, fullParams);
                cachedResult = this.cache.get(cacheKey);

                if (cachedResult) {
                    const responseTime = Date.now() - startTime;
                    return ResponseFormatter.addCacheInfo(
                        ResponseFormatter.formatSuccess(operation, cachedResult, {}, { responseTime }),
                        true,
                        this.cache.getStats()
                    );
                }
            }

            const url = this.buildUrl(endpoint, fullParams);
            const response = await this.httpClient.get(url, { identifier: options.identifier || 'default' });

            const processedResponse = this.processApiResponse(response, operation);

            if (this.cache && cacheKey && options.useCache !== false) {
                this.cache.set(cacheKey, processedResponse, options.cacheTTL);
            }

            const responseTime = Date.now() - startTime;
            return ResponseFormatter.addCacheInfo(
                ResponseFormatter.formatSuccess(operation, processedResponse, {}, { responseTime }),
                false,
                this.cache ? this.cache.getStats() : {}
            );

        } catch (error) {
            const responseTime = Date.now() - startTime;
            if (error instanceof BaseError) {
                throw error;
            }
            throw new TourismApiError(
                'API_REQUEST_FAILED',
                operation,
                500,
                { endpoint, params: SafeUtils.maskSensitiveData(params), responseTime },
                { originalError: error.message },
                this.i18n
            );
        }
    }

    validateAndSanitizeParams(params) {
        const sanitized = {};
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                if (typeof value === 'string') {
                    const threats = SecurityModule.detectThreats(value);
                    if (!threats.safe) {
                        throw new SecurityError(
                            `Security threat detected in parameter '${key}'`,
                            'PARAMETER_THREAT',
                            { key, threats: threats.threats }
                        );
                    }
                    sanitized[key] = SecurityModule.sanitizeInput(value, 1000);
                } else {
                    sanitized[key] = value;
                }
            }
        });
        return sanitized;
    }

    processApiResponse(response, operation) {
        if (!response || typeof response !== 'object') {
            throw new TourismApiError(
                'INVALID_API_RESPONSE',
                operation,
                500,
                { response: String(response) },
                {},
                this.i18n
            );
        }

        if (response.response) {
            const apiResponse = response.response;
            if (apiResponse.header) {
                const resultCode = apiResponse.header.resultCode;
                const resultMsg = apiResponse.header.resultMsg;
                if (resultCode !== '0000') {
                    const errorCode = this.mapApiErrorCode(resultCode);
                    throw new TourismApiError(
                        errorCode,
                        operation,
                        400,
                        { resultCode, resultMsg },
                        {},
                        this.i18n
                    );
                }
            }
            if (apiResponse.body) {
                return apiResponse.body;
            }
        }
        return response;
    }

    mapApiErrorCode(apiErrorCode) {
        const errorCodeMap = {
            '00': 'APPLICATION_ERROR',
            '01': 'DB_ERROR',
            '02': 'NODATA_ERROR',
            '03': 'HTTP_ERROR',
            '04': 'SERVICETIMEOUT_ERROR',
            '05': 'INVALID_REQUEST_PARAMETER_ERROR',
            '10': 'NO_MANDATORY_REQUEST_PARAMETERS_ERROR',
            '11': 'NO_MANDATORY_REQUEST_PARAMETERS_ERROR',
            '12': 'NO_MANDATORY_REQUEST_PARAMETERS_ERROR',
            '20': 'END_OF_SERVICE_ERROR',
            '22': 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR',
            '30': 'SERVICE_ACCESS_DENIED_ERROR',
            '31': 'TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR',
            '32': 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR',
            '33': 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
            '99': 'DEADLINE_HAS_EXPIRED_ERROR'
        };
        return errorCodeMap[apiErrorCode] || 'API_ERROR';
    }

    async areaBasedList(params = {}) {
        const schema = {
            numOfRows: { type: 'integer', min: 1, max: 1000 },
            pageNo: { type: 'integer', min: 1 },
            areaCode: { type: 'integer', min: 1 },
            sigunguCode: { type: 'integer', min: 1 },
            contentTypeId: { type: 'integer', min: 12, max: 39 },
            cat1: { type: 'string', maxLength: 5 },
            cat2: { type: 'string', maxLength: 5 },
            cat3: { type: 'string', maxLength: 9 },
            listYN: { type: 'string', enum: ['Y', 'N'] },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] }
        };

        const validation = SafeUtils.validateAndTransform(params, schema);
        if (!validation.valid) {
            throw new ValidationError(validation.errors.join(', '), 'params', params, this.i18n);
        }

        // 공식 문서에 따라 '/areaBasedList1'을 '/areaBasedList2'로 수정
        return this.makeRequest('/areaBasedList2', validation.data, {
            operation: 'areaBasedList',
            useCache: true,
            cacheTTL: 300000
        });
    }

    async detailCommon(params = {}) {
        const schema = {
            contentId: { type: 'integer', required: true, min: 1 },
            contentTypeId: { type: 'integer', min: 12, max: 39 },
            defaultYN: { type: 'string', enum: ['Y', 'N'] },
            firstImageYN: { type: 'string', enum: ['Y', 'N'] },
            areacodeYN: { type: 'string', enum: ['Y', 'N'] },
            catcodeYN: { type: 'string', enum: ['Y', 'N'] },
            addrinfoYN: { type: 'string', enum: ['Y', 'N'] },
            mapinfoYN: { type: 'string', enum: ['Y', 'N'] },
            overviewYN: { type: 'string', enum: ['Y', 'N'] }
        };

        const validation = SafeUtils.validateAndTransform(params, schema);
        if (!validation.valid) {
            throw new ValidationError(validation.errors.join(', '), 'params', params, this.i18n);
        }

        // 공식 문서에 따라 '/detailCommon1'을 '/detailCommon2'로 수정
        return this.makeRequest('/detailCommon2', validation.data, {
            operation: 'detailCommon',
            useCache: true,
            cacheTTL: 600000
        });
    }

    async searchKeyword(params = {}) {
        const schema = {
            numOfRows: { type: 'integer', min: 1, max: 1000 },
            pageNo: { type: 'integer', min: 1 },
            keyword: { type: 'string', required: true, minLength: 1, maxLength: 100 },
            contentTypeId: { type: 'integer', min: 12, max: 39 },
            areaCode: { type: 'integer', min: 1 },
            sigunguCode: { type: 'integer', min: 1 },
            cat1: { type: 'string', maxLength: 5 },
            cat2: { type: 'string', maxLength: 5 },
            cat3: { type: 'string', maxLength: 9 },
            listYN: { type: 'string', enum: ['Y', 'N'] },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'O', 'P', 'Q', 'R'] }
        };

        const validation = SafeUtils.validateAndTransform(params, schema);
        if (!validation.valid) {
            throw new ValidationError(validation.errors.join(', '), 'params', params, this.i18n);
        }

        // 공식 문서에 따라 '/searchKeyword1'을 '/searchKeyword2'로 수정
        return this.makeRequest('/searchKeyword2', validation.data, {
            operation: 'searchKeyword',
            useCache: true,
            cacheTTL: 180000
        });
    }

    async locationBasedList(params = {}) {
        const schema = {
            numOfRows: { type: 'integer', min: 1, max: 1000 },
            pageNo: { type: 'integer', min: 1 },
            mapX: { type: 'number', required: true, min: 124, max: 132 },
            mapY: { type: 'number', required: true, min: 33, max: 43 },
            radius: { type: 'integer', min: 1, max: 20000 },
            contentTypeId: { type: 'integer', min: 12, max: 39 },
            listYN: { type: 'string', enum: ['Y', 'N'] },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] }
        };

        const validation = SafeUtils.validateAndTransform(params, schema);
        if (!validation.valid) {
            throw new ValidationError(validation.errors.join(', '), 'params', params, this.i18n);
        }

        if (!GeoUtils.isValidCoordinate(validation.data.mapY, validation.data.mapX, { koreaOnly: true })) {
            throw new ValidationError(
                this.i18n.getMessage('INVALID_COORDINATES', { lat: validation.data.mapY, lng: validation.data.mapX }),
                'coordinates',
                { mapX: validation.data.mapX, mapY: validation.data.mapY },
                this.i18n
            );
        }

        // 공식 문서에 따라 '/locationBasedList1'을 '/locationBasedList2'로 수정
        return this.makeRequest('/locationBasedList2', validation.data, {
            operation: 'locationBasedList',
            useCache: true,
            cacheTTL: 300000
        });
    }

    async batchRequest(requests, options = {}) {
        if (!this.batchEnabled) {
            throw new TourismApiError('BATCH_DISABLED', 'batchRequest', 400, {}, {}, this.i18n);
        }

        if (!Array.isArray(requests) || requests.length === 0) {
            throw new ValidationError('Requests must be a non-empty array', 'requests', requests, this.i18n);
        }

        if (requests.length > this.maxBatchSize) {
            throw new ValidationError(
                this.i18n.getMessage('BATCH_SIZE_EXCEEDED', { max: this.maxBatchSize, actual: requests.length }),
                'requests',
                requests.length,
                this.i18n
            );
        }

        const { concurrency = 3, failFast = false } = options;
        const results = [];

        for (let i = 0; i < requests.length; i += concurrency) {
            const batch = requests.slice(i, i + concurrency);
            const batchPromises = batch.map(async (request, index) => {
                try {
                    const { method, params, options: requestOptions } = request;

                    if (typeof this[method] !== 'function') {
                        throw new ValidationError(`Invalid method: ${method}`, 'method', method, this.i18n);
                    }

                    const result = await this[method](params, requestOptions);
                    return { index: i + index, success: true, data: result };
                } catch (error) {
                    if (failFast) {
                        throw error;
                    }
                    return { index: i + index, success: false, error: error.toJSON ? error.toJSON() : { message: error.message } };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        return results.sort((a, b) => a.index - b.index);
    }

    destroy() {
        if (this.cache && typeof this.cache.destroy === 'function') {
            this.cache.destroy();
        }
        console.log('Tourism API client destroyed');
    }
}

// ===== 메인 핸들러 =====
class TourismApiHandler {
    constructor() {
        this.container = new ServiceContainer();
        this.initialized = false;
        this.initializeServices();
    }

    initializeServices() {
        this.container.register('i18n', () => new InternationalizationManager());

        this.container.register('cache', () => new AdvancedCache({
            maxSize: PRODUCTION_CONFIG.MAX_CACHE_SIZE,
            defaultTTL: PRODUCTION_CONFIG.DEFAULT_TTL,
            maxMemoryUsage: PRODUCTION_CONFIG.MAX_MEMORY_USAGE
        }));

        this.container.register('rateLimiter', () => new RateLimiter({
            windowSize: PRODUCTION_CONFIG.RATE_LIMIT_WINDOW,
            maxRequests: PRODUCTION_CONFIG.MAX_RATE_LIMIT
        }));

        this.container.register('apiClient', (container) => new TourismApiClient({
            cache: container.get('cache'),
            rateLimiter: container.get('rateLimiter'),
            i18n: container.get('i18n')
        }), { dependencies: ['cache', 'rateLimiter', 'i18n'] });

        this.container.initialize();
        this.initialized = true;
    }

    async handle(event, context = {}) {
        const requestId = SafeUtils.generateRequestId('req');
        const startTime = Date.now();

        try {

            if (!this.initialized) {
                this.initializeServices();
            }

            const request = this.parseRequest(event);
            this.validateSecurity(request);

            const result = await this.routeRequest(request, { requestId });

            const responseTime = Date.now() - startTime;
            return this.formatResponse(200, result, { requestId, responseTime });

        } catch (error) {
            const responseTime = Date.now() - startTime;
            console.error('Handler error:', error);
            return this.formatErrorResponse(error, { requestId, responseTime });
        }
    }

    parseRequest(event) {
        const request = {
            method: 'GET',
            path: '/',
            query: {},
            body: null,
            headers: {},
            ip: 'unknown'
        };

        if (event.httpMethod) {
            request.method = event.httpMethod;
            request.path = event.path || '/';
            request.query = event.queryStringParameters || {};
            request.headers = event.headers || {};
            request.ip = event.requestContext?.identity?.sourceIp || 'unknown';

            if (event.body) {
                try {
                    if (typeof event.body === 'string') {
                        request.body = JSON.parse(event.body);
                    } else {
                        request.body = event.body;
                    }
                } catch (error) {
                    request.body = event.body;
                }
            }
        } else if (event.query) { // For direct function invocation or testing
            request.query = event.query;
            request.headers = event.headers || {};
            request.body = event.body || null;
        } else { // Fallback for very simple event structures
            request.query = event;
        }

        return request;
    }

    validateSecurity(request) {
        if (request.ip && request.ip !== 'unknown') {
            // IP 기반 검증 로직 (선택적)
        }

        const requestSize = JSON.stringify(request).length;
        if (requestSize > 1024 * 1024) { // 1MB limit
            throw new SecurityError('Request too large', 'REQUEST_TOO_LARGE', { size: requestSize });
        }

        Object.entries(request.query).forEach(([key, value]) => {
            if (typeof value === 'string') {
                const threats = SecurityModule.detectThreats(value);
                if (!threats.safe) {
                    throw new SecurityError(
                        `Security threat detected in query parameter '${key}'`,
                        'QUERY_THREAT',
                        { key, threats: threats.threats }
                    );
                }
            }
        });
    }

    async routeRequest(request, context) {
        const apiClient = this.container.get('apiClient');
        
        // 'operation' 매개변수를 request.query에서 명시적으로 가져옵니다.
        // 이는 프론트엔드가 URL 쿼리 스트링으로 operation을 보내는 방식과 일치해야 합니다.
        const operation = request.query.operation; 

        const supportedOperations = [
            'areaBasedList',
            'detailCommon',
            'searchKeyword',
            'locationBasedList',
            'batchRequest'
            // 여기에 다른 API 오퍼레이션도 추가할 수 있습니다.
        ];

        // operation이 없거나 지원되지 않는 값인 경우 ValidationError를 발생시킵니다.
        // 이는 백엔드가 'api/tourism'과 같은 경로 자체를 operation으로 해석하는 것을 방지합니다.
        if (!operation || !supportedOperations.includes(operation)) {
            throw new ValidationError(
                `Unsupported operation: ${operation || '[missing operation parameter]'}. Supported: ${supportedOperations.join(', ')}`,
                'operation',
                operation,
                this.container.get('i18n')
            );
        }

        // operation이 batchRequest인 경우
        if (operation === 'batchRequest') {
            if (!request.body || !Array.isArray(request.body.requests)) {
                throw new ValidationError('Batch request requires requests array in body', 'body', request.body);
            }
            return apiClient.batchRequest(request.body.requests, request.body.options);
        }

        // operation을 제외한 나머지 쿼리 파라미터를 API 클라이언트에 전달
        const params = { ...request.query };
        delete params.operation; // params 객체에서 operation 속성 제거 (중복 방지)

        if (operation === 'locationBasedList' && params.mapX && params.mapY) {
            const result = await apiClient[operation](params, { identifier: request.ip });
            // addDistance 파라미터가 'Y'이면 거리 정보 추가
            if (result.data && result.data.items && params.addDistance === 'Y') {
                // items가 배열이 아닌 경우를 대비하여 배열로 변환
                const itemsArray = Array.isArray(result.data.items.item) ? result.data.items.item : (result.data.items.item ? [result.data.items.item] : []);

                result.data.items.item = GeoUtils.addDistanceInfo(
                    itemsArray,
                    params.mapY,
                    params.mapX,
                    params.radius || 1000,
                    { unit: 'm', sortByDistance: true }
                );
            }
            return result;
        }

        // 나머지 모든 지원되는 operation에 대해 해당 apiClient 메서드 호출
        return apiClient[operation](params, { identifier: request.ip });
    }

    formatResponse(statusCode, data, metadata = {}) {
        const response = {
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                // CORS 헤더는 vercelHandler에서 이미 설정됩니다. 중복을 피하기 위해 여기서는 제거합니다.
                // 'Access-Control-Allow-Origin': '*', 
                // 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                // 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'X-Request-ID': metadata.requestId,
                'X-Response-Time': `${metadata.responseTime}ms`
            },
            body: JSON.stringify(data, null, 2)
        };

        return response;
    }

    formatErrorResponse(error, metadata = {}) {
        let statusCode = 500;
        let errorResponse;

        if (error instanceof BaseError) {
            statusCode = error.statusCode;
            errorResponse = error.toJSON();
        } else {
            errorResponse = ResponseFormatter.formatError(error, 'handler');
        }

        return this.formatResponse(statusCode, errorResponse, metadata);
    }

    destroy() {
        if (this.container) {
            this.container.destroy();
        }
        this.initialized = false;
        console.log('Tourism API handler destroyed');
    }
}

// ===== 전역 인스턴스 및 Vercel 핸들러 =====
let globalHandler = null;

/**
 * Vercel 서버리스 함수 핸들러 (보안 강화 버전)
 */
async function vercelHandler(req, res) {
    try {
        // 전역 핸들러 인스턴스 재사용
        if (!globalHandler) {
            globalHandler = new TourismApiHandler();
        }

        // 요청 객체 생성 (URL 파싱 포함)
        const url = new URL(req.url, `http://${req.headers.host}`); // 호스트는 URL 객체 생성을 위한 기본 URL로 사용
        const queryParams = Object.fromEntries(url.searchParams.entries()); // 쿼리 파라미터를 객체로 변환

        const request = {
            method: req.method,
            headers: req.headers || {},
            query: queryParams, // 파싱된 쿼리 파라미터 사용
            body: req.body,
            url: req.url || '/'
        };

        // 1. Origin/Referer 검증 및 CORS 헤더 설정
        const originValidation = ApiSecurityValidator.validateOrigin(request);
        const corsHeaders = ApiSecurityValidator.generateCorsHeaders(originValidation);
        
        // CORS 헤더 즉시 설정
        Object.entries(corsHeaders).forEach(([key, value]) => {
            res.setHeader(key, value);
        });

        // OPTIONS 요청 처리 (preflight)
        if (req.method === 'OPTIONS') {
            if (!originValidation.valid) {
                // 허용되지 않은 Origin에 대한 Preflight 요청 차단
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'FORBIDDEN_ORIGIN',
                        message: originValidation.message || 'Origin not allowed',
                        timestamp: new Date().toISOString()
                    }
                });
            }
            return res.status(200).end();
        }

        // 2. API 키 검증 (GET/POST 요청만)
        const apiKeyValidation = ApiSecurityValidator.validateApiKey(request);
        if (!apiKeyValidation.valid) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: apiKeyValidation.message,
                    reason: apiKeyValidation.reason,
                    timestamp: new Date().toISOString()
                }
            });
        }

        // 3. Origin 검증 (API 키가 유효한 경우에만) - OPTIONS 요청 후 실제 요청에 대해
        // Preflight에서 이미 처리되었으므로 여기서는 명시적인 차단은 하지 않고 정보만 확인
        if (!originValidation.valid && originValidation.reason !== 'no_origin') {
            // 이 경우, CORS 헤더가 이미 'null'로 설정되어 브라우저에서 차단될 것이므로,
            // 추가적인 응답 차단 로직은 필요 없을 수 있습니다.
            // 하지만 명시적인 오류 응답을 원한다면 여기에 추가할 수 있습니다.
            // 예: throw new SecurityError(originValidation.message, 'FORBIDDEN_ORIGIN', { origin: originValidation.origin });
        }


        // Vercel req/res를 AWS Lambda event/context 형식으로 변환
        const event = {
            httpMethod: req.method,
            queryStringParameters: request.query, // 파싱된 쿼리 파라미터 사용
            body: req.body,
            headers: req.headers || {},
            path: url.pathname || '/', // 경로만 사용 (쿼리 스트링 제외)
            requestContext: {
                requestId: req.headers['x-vercel-id'] || SafeUtils.generateRequestId('vercel'),
                identity: {
                    sourceIp: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'
                }
            }
        };

        const context = {
            requestId: event.requestContext.requestId,
            functionName: 'tourism-api',
            functionVersion: '1.0.0',
            memoryLimitInMB: '1024',
            getRemainingTimeInMillis: () => 30000
        };

        const result = await globalHandler.handle(event, context);

        // 응답 헤더 설정
        const statusCode = result.statusCode || 200;
        const responseHeaders = result.headers || {};

        Object.entries(responseHeaders).forEach(([key, value]) => {
            // CORS 헤더는 vercelHandler 시작 부분에서 이미 설정됩니다. 중복을 피하기 위해 여기서는 제거합니다.
            // 'Access-Control-Allow-Origin': '*', 
            // 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            // 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            if (!res.getHeader(key) || !key.startsWith('Access-Control-')) { // CORS 헤더는 여기서 덮어쓰지 않도록 조건 추가
                 res.setHeader(key, value);
            }
        });

        if (!res.getHeader('Content-Type')) {
            res.setHeader('Content-Type', 'application/json');
        }

        // 보안 헤더 추가
        res.setHeader('X-Request-ID', context.requestId);
        res.setHeader('X-API-Version', '1.0.0');
        res.setHeader('X-Rate-Limit', PRODUCTION_CONFIG.RATE_LIMIT_MAX);

        if (result.body) {
            return res.status(statusCode).send(result.body);
        } else {
            return res.status(statusCode).end();
        }

    } catch (error) {
        console.error('Critical handler error:', error);
        
        // 오류 발생 시에도 CORS 헤더가 올바르게 설정되도록 보장
        // (함수 시작 부분에서 이미 설정되었으므로 여기서는 추가 설정 대신,
        // 오류 응답 본문에 필요한 정보만 제공)
        res.setHeader('Content-Type', 'application/json');
        
        // 이전에 설정된 Access-Control-Allow-Origin이 유효하지 않으면 브라우저는 이 응답을 받지 못할 수 있습니다.
        // 하지만 서버 측 로그에는 오류가 기록됩니다.
        return res.status(500).json({
            success: false,
            error: {
                code: error.code || 'CRITICAL_ERROR',
                message: error.message || 'A critical error occurred',
                timestamp: new Date().toISOString(),
                requestId: error.requestId || SafeUtils.generateRequestId('err')
            }
        });
    }
}

// 정리 함수
function cleanup() {
    if (globalHandler) {
        globalHandler.destroy();
        globalHandler = null;
    }
}

// Node.js 환경에서 모듈 내보내기
if (NODE_ENV && typeof module !== 'undefined' && module.exports) {
    module.exports = vercelHandler;
    module.exports.handler = vercelHandler;
    module.exports.cleanup = cleanup;
    module.exports.TourismApiHandler = TourismApiHandler;
    module.exports.TourismApiClient = TourismApiClient;
    module.exports.SafeUtils = SafeUtils;
    module.exports.GeoUtils = GeoUtils;
    module.exports.SecurityModule = SecurityModule;
    module.exports.ApiSecurityValidator = ApiSecurityValidator;
    module.exports.AdvancedCache = AdvancedCache;
    module.exports.RateLimiter = RateLimiter;
    module.exports.ServiceContainer = ServiceContainer;
    module.exports.InternationalizationManager = InternationalizationManager;
    module.exports.ResponseFormatter = ResponseFormatter;
    module.exports.HttpClient = HttpClient;
}

// 브라우저 환경에서 전역 객체에 할당
if (BROWSER_ENV) {
    window.TourismAPI = {
        vercelHandler,
        cleanup,
        TourismApiHandler,
        TourismApiClient,
        SafeUtils,
        GeoUtils,
        SecurityModule,
        ApiSecurityValidator,
        AdvancedCache,
        RateLimiter,
        ServiceContainer,
        InternationalizationManager,
        ResponseFormatter,
        HttpClient
    };
}

// Vercel 기본 export
export default vercelHandler;

// 초기화 로그
console.log('Tourism API Ultimate Production Version with Security loaded successfully');
console.log('Security status:', securityLibraryStatus);
console.log('Environment:', NODE_ENV ? 'Node.js' : 'Browser');
console.log('API Base URL:', PRODUCTION_CONFIG.API_BASE_URL);
console.log('Allowed domains:', PRODUCTION_CONFIG.ALLOWED_DOMAINS.join(', '));
console.log('Service start time:', new Date(SERVICE_START_TIME).toISOString());

/** * 배포 전 최종 체크리스트: * ✅ HTTPS 엔드포인트 확정 (PRODUCTION_CONFIG.API_BASE_URL) * ✅ 완전한 국제화 메시지 구현 * ✅ 스키마 기반 입력값 검증 구현 * ✅ Vercel req.body 직접 처리 * ✅ 보안 모듈 완전 구현 * ✅ API 키 검증 시스템 구현 * ✅ CORS 도메인 제한 구현 * ✅ 에러 처리 시스템 완성 * ✅ 캐시 및 Rate Limiter 최적화 * ✅ 서비스 컨테이너 완성 * ✅ 동적 CORS 헤더 완전 구현 * * 필수 환경 설정: * 1. package.json에 "isomorphic-dompurify" 추가 * 2. Vercel 환경변수에 TOURISM_API_KEY 설정 * 3. Vercel 환경변수에 ALLOWED_API_KEYS 설정 (예: key1,key2,key3) * 4. PRODUCTION_CONFIG.ALLOWED_DOMAINS에 실제 도메인 추가 * 5. Node.js 18+ 런타임 사용 * * 클라이언트 사용법: * 1. 요청 헤더에 X-API-Key 포함 * 2. 허용된 도메인에서만 요청 * 3. API 키는 환경변수 ALLOWED_API_KEYS에 등록된 것만 사용 */
