// 관광 정보 API 서버리스 함수 (프로덕션 최적화 버전)

/**
 * 주요 수정 사항:
 * 1. SafeUtils.sanitizeInput의 정규식 오류 수정 (기존 반영)
 * 2. ResponseFormatter.formatError의 메시지 처리 개선 (기존 반영)
 * 3. InternationalizationManager의 메시지 일관성 개선 (기존 반영)
 * 4. HttpClient의 ServiceKey 처리 로직 개선 (기존 반영)
 * 5. 국제화 메시지의 문법 및 형식 통일 (기존 반영)
 * 6. 에러 처리 로직의 안정성 향상 (기존 반영)
 * 7. AdvancedCache, RateLimiter에서 setInterval 제거 (서버리스 환경 최적화)
 * 8. ConfigManager 설정 항목 간결화 (핵심 기능 위주)
 * 9. HTML 새니타이징 라이브러리 사용 강력 권고 및 예시 추가
 */

// ===== 전역 상수 정의 =====
const SERVICE_START_TIME = Date.now();
const hasProcess = typeof process !== 'undefined' && process.versions && process.versions.node;

// ===== 기본 유틸리티 =====
/**
 * 다양한 유틸리티 함수를 제공하는 클래스입니다.
 */
class SafeUtils {
    /**
     * 고유한 요청 ID를 생성합니다.
     * @returns {string} 생성된 요청 ID
     */
    static generateRequestId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    /**
     * 안전하게 정수를 파싱합니다.
     * @param {*} value - 파싱할 값
     * @param {number} defaultValue - 파싱 실패 시 반환할 기본값
     * @returns {number} 파싱된 정수 또는 기본값
     */
    static safeParseInt(value, defaultValue = NaN) {
        if (value === null || value === undefined || value === '') return defaultValue;
        const num = parseInt(value, 10);
        return isNaN(num) ? defaultValue : num;
    }

    /**
     * 안전하게 부동 소수점을 파싱합니다.
     * @param {*} value - 파싱할 값
     * @param {number} defaultValue - 파싱 실패 시 반환할 기본값
     * @returns {number} 파싱된 부동 소수점 또는 기본값
     */
    static safeParseFloat(value, defaultValue = NaN) {
        if (value === null || value === undefined || value === '') return defaultValue;
        const num = parseFloat(value);
        return isNaN(num) ? defaultValue : num;
    }

    /**
     * 입력 문자열을 위생 처리합니다.
     * HTML 태그를 제거하고 기본적인 XSS 방지를 수행합니다.
     * **주의: 이 함수는 기본적인 위생 처리만 제공합니다. 복잡한 HTML 콘텐츠의 XSS 방지를 위해서는
     * `isomorphic-dompurify` (브라우저/Node.js) 또는 `sanitize-html` (Node.js)과 같은
     * 전문 라이브러리 사용을 강력히 권장합니다. 현재 구현은 완전한 XSS 방어를 보장하지 않습니다.**
     * @param {string} input - 위생 처리할 문자열
     * @param {number} maxLength - 최대 길이
     * @param {object} options - 추가 옵션
     * @param {string[]} [options.allowedTags] - 허용할 HTML 태그 (기본: 태그 제거). 이 옵션 사용 시에도 전문 라이브러리 사용을 권장합니다.
     * @returns {string} 위생 처리된 문자열
     */
    static sanitizeInput(input, maxLength = 1000, options = {}) {
        if (typeof input !== 'string') return input;

        let sanitized = input.trim();
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength);
        }

        // HTML 태그 처리
        if (options.allowedTags && Array.isArray(options.allowedTags)) {
            // 허용된 태그를 제외하고 모든 태그를 제거하는 정규식.
            // 주의: 이 방식은 완벽한 HTML 파싱이 아니므로, 복잡한 HTML에서는 전문 라이브러리 사용 권장.
            const allowedTagsPattern = options.allowedTags.map(tag => `(?:${tag})`).join('|');
            const tagRegex = new RegExp(`<(?!\\/?(?:${allowedTagsPattern})\\b)[^>]*?>`, 'gi');
            sanitized = sanitized.replace(tagRegex, '');
        } else {
            // 기본적으로 모든 HTML 태그 제거
            sanitized = sanitized.replace(/<[^>]*>/g, '');
        }

        // 기본적인 XSS 방지 (더 강력한 라이브러리 사용 권장)
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

    /**
     * 민감한 데이터를 마스킹합니다.
     * @param {object} data - 마스킹할 데이터 객체
     * @param {string[]} fieldsToMask - 마스킹할 필드 이름 목록
     * @returns {object} 마스킹된 데이터 객체
     */
    static maskSensitiveData(data, fieldsToMask = ['apiKey', 'password', 'token', 'ServiceKey']) {
        if (typeof data !== 'object' || data === null) return data;
        const maskedData = { ...data };
        for (const field of fieldsToMask) {
            if (maskedData.hasOwnProperty(field)) {
                maskedData[field] = '***MASKED***';
            }
        }
        return maskedData;
    }

    /**
     * URL이 유효한 형식인지 확인합니다.
     * 반드시 'http://' 또는 'https://'로 시작하는 유효한 URL만 허용합니다.
     * @param {string} string - 확인할 URL 문자열
     * @returns {boolean} 유효성 여부
     */
    static isValidUrl(string) {
        if (typeof string !== 'string') return false;
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }

    /**
     * 지정된 시간(ms) 동안 대기합니다.
     * @param {number} ms - 대기할 시간 (밀리초)
     * @returns {Promise<void>}
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ===== 지리 유틸리티 =====
/**
 * 지리 관련 유틸리티 함수를 제공하는 클래스입니다.
 */
class GeoUtils {
    /**
     * 좌표가 유효한 범위 내에 있는지 확인합니다.
     * @param {number|string} lat - 위도
     * @param {number|string} lng - 경도
     * @returns {boolean} 유효성 여부
     */
    static isValidCoordinate(lat, lng) {
        const numLat = SafeUtils.safeParseFloat(lat);
        const numLng = SafeUtils.safeParseFloat(lng);
        if (isNaN(numLat) || isNaN(numLng)) return false;
        return numLat >= -90 && numLat <= 90 && numLng >= -180 && numLng <= 180;
    }

    /**
     * 두 지점 간의 거리를 계산합니다 (하버사인 공식).
     * @param {number} lat1 - 첫 번째 지점 위도
     * @param {number} lon1 - 첫 번째 지점 경도
     * @param {number} lat2 - 두 번째 지점 위도
     * @param {number} lon2 - 두 번째 지점 경도
     * @returns {number} 미터 단위 거리
     */
    static getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // 지구 반지름 (미터)
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // 미터 단위 거리
    }

    /**
     * 아이템 목록에 사용자 위치와의 거리 정보를 추가하고, 특정 반경 내의 아이템만 필터링합니다.
     * @param {Array<object>} items - 관광지 아이템 목록 (mapx, mapy 필드 포함)
     * @param {number|string} userLat - 사용자 위도
     * @param {number|string} userLng - 사용자 경도
     * @param {number|string} radius - 필터링할 반경 (미터)
     * @returns {Array<object>} 거리 정보가 추가되고 필터링된 아이템 목록
     */
    static addDistanceInfo(items, userLat, userLng, radius) {
        const lat = SafeUtils.safeParseFloat(userLat);
        const lng = SafeUtils.safeParseFloat(userLng);
        const rad = SafeUtils.safeParseFloat(radius);

        if (isNaN(lat) || isNaN(lng)) {
            return items; // 사용자 좌표가 유효하지 않으면 거리 계산 없이 원본 반환
        }

        return items.map(item => {
            const itemLat = SafeUtils.safeParseFloat(item.mapy); // mapy가 위도
            const itemLng = SafeUtils.safeParseFloat(item.mapx); // mapx가 경도

            if (!isNaN(itemLat) && !isNaN(itemLng)) {
                const distance = this.getDistance(lat, lng, itemLat, itemLng);
                item.distance = distance; // 미터 단위
            }
            return item;
        }).filter(item => {
            if (isNaN(rad) || rad <= 0) return true; // radius가 유효하지 않거나 0 이하면 필터링 안 함
            return item.distance !== undefined && item.distance <= rad;
        }).sort((a, b) => {
            // 거리를 기준으로 오름차순 정렬
            if (a.distance === undefined && b.distance === undefined) return 0;
            if (a.distance === undefined) return 1; // 거리가 없는 항목은 뒤로
            if (b.distance === undefined) return -1; // 거리가 없는 항목은 뒤로
            return a.distance - b.distance;
        });
    }
}

// ===== 사용자 정의 에러 클래스 =====
/**
 * 모든 사용자 정의 에러의 기본 클래스입니다.
 */
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
            this.get(name);
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
                VALIDATION_ERROR_FIELD: "필드 '${field}' 검증 오류: ${message}.",
                API_TIMEOUT: 'API 요청 시간 초과 (${timeout}ms, 작업: ${operation}).',
                RATE_LIMIT_EXCEEDED: '요청 한도 초과. 한도: ${limit}, 남은 요청: ${remaining}.',
                SECURITY_ERROR: '보안 위협이 감지되었습니다.',
                UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다.',
                MISSING_API_KEY: 'TOURISM_API_KEY 환경변수가 설정되지 않았습니다. API 키를 설정해주세요.',
                INVALID_API_KEY: '제공된 API 키가 유효하지 않습니다.',
                UNSUPPORTED_OPERATION: "지원하지 않는 작업입니다: '${operation}'.",
                BATCH_DISABLED: '배치 요청 기능이 비활성화되어 있습니다.',
                BATCH_SIZE_EXCEEDED: '최대 ${max}개의 작업만 배치로 처리할 수 있습니다. (요청: ${actual}).',
                INVALID_RANGE: "필드 '${field}'의 값이 유효한 범위를 벗어났습니다. (허용 범위: ${min} ~ ${max}).",
                NUMERIC_ERROR: "필드 '${field}'는 숫자여야 합니다.",
                INVALID_FORMAT: "필드 '${field}'의 형식이 올바르지 않습니다.",
                INVALID_COORDINATES: "좌표값이 유효하지 않습니다 (위도: ${lat}, 경도: ${lng}).",
                MIN_LENGTH_ERROR: "최소 길이는 ${minLength}자입니다. (현재: ${actual}자).",
                MAX_LENGTH_ERROR: "최대 길이는 ${maxLength}자입니다. (현재: ${actual}자).",
                ENUM_ERROR: "허용된 값 중 하나여야 합니다: ${values}.",
                API_RESPONSE_ERROR: "API 응답에 오류가 발생했습니다. 상태: ${status} ${statusText}.",
                API_LOGIC_ERROR: "API 내부 처리 오류가 발생했습니다. 코드: ${resultCode}.",
                NETWORK_ERROR: "네트워크 오류가 발생하여 API 요청을 처리할 수 없습니다.",
                APPLICATION_ERROR: "애플리케이션 오류가 발생했습니다.",
                DB_ERROR: "데이터베이스 오류가 발생했습니다.",
                NODATA_ERROR: "데이터가 없습니다.",
                HTTP_ERROR: "HTTP 오류가 발생했습니다.",
                SERVICETIMEOUT_ERROR: "서비스 연결 시간이 초과되었습니다.",
                INVALID_REQUEST_PARAMETER_ERROR: "잘못된 요청 파라미터입니다.",
                NO_MANDATORY_REQUEST_PARAMETERS_ERROR: "필수 요청 파라미터가 누락되었습니다.",
                END_OF_SERVICE_ERROR: "해당 오픈 API 서비스가 없거나 폐기되었습니다.",
                SERVICE_ACCESS_DENIED_ERROR: "서비스 접근이 거부되었습니다.",
                TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR: "일시적으로 사용할 수 없는 서비스 키입니다.",
                LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR: "서비스 요청 제한 횟수를 초과했습니다.",
                SERVICE_KEY_IS_NOT_REGISTERED_ERROR: "등록되지 않은 서비스 키입니다.",
                DEADLINE_HAS_EXPIRED_ERROR: "서비스 키 사용 기간이 만료되었습니다.",
                UNREGISTERED_IP_ERROR: "등록되지 않은 IP입니다."
            },
            en: {
                API_ERROR: 'API error occurred (operation: ${operation}).',
                VALIDATION_ERROR: 'Input validation error occurred.',
                VALIDATION_ERROR_FIELD: "Validation error for field '${field}': ${message}.",
                API_TIMEOUT: 'API request timed out after ${timeout}ms for operation \'${operation}\'.',
                RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Limit: ${limit}, Remaining: ${remaining}.',
                SECURITY_ERROR: 'Security threat detected.',
                UNKNOWN_ERROR: 'An unexpected error occurred.',
                MISSING_API_KEY: 'TOURISM_API_KEY environment variable is not set. Please configure the API key.',
                INVALID_API_KEY: 'The provided API key is invalid.',
                UNSUPPORTED_OPERATION: "Unsupported operation: '${operation}'.",
                BATCH_DISABLED: 'Batch request functionality is disabled.',
                BATCH_SIZE_EXCEEDED: 'Maximum batch size of ${max} exceeded. (Requested: ${actual}).',
                INVALID_RANGE: "Field '${field}' is out of valid range. (Allowed: ${min} - ${max}).",
                NUMERIC_ERROR: "Field '${field}' must be a number.",
                INVALID_FORMAT: "Field '${field}' has an invalid format.",
                INVALID_COORDINATES: "Invalid coordinates (Latitude: ${lat}, Longitude: ${lng}).",
                MIN_LENGTH_ERROR: "Minimum length is ${minLength}. (Actual: ${actual}).",
                MAX_LENGTH_ERROR: "Maximum length is ${maxLength}. (Actual: ${actual}).",
                ENUM_ERROR: "Must be one of the allowed values: ${values}.",
                API_RESPONSE_ERROR: "API response error. Status: ${status} ${statusText}.",
                API_LOGIC_ERROR: "API internal processing error. Code: ${resultCode}.",
                NETWORK_ERROR: "Network error occurred, unable to process API request.",
                APPLICATION_ERROR: "Application error occurred.",
                DB_ERROR: "Database error occurred.",
                NODATA_ERROR: "No data found.",
                HTTP_ERROR: "HTTP error occurred.",
                SERVICETIMEOUT_ERROR: "Service connection timed out.",
                INVALID_REQUEST_PARAMETER_ERROR: "Invalid request parameter.",
                NO_MANDATORY_REQUEST_PARAMETERS_ERROR: "Missing mandatory request parameter.",
                END_OF_SERVICE_ERROR: "The open API service is not available or has been discontinued.",
                SERVICE_ACCESS_DENIED_ERROR: "Service access denied.",
                TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR: "Service key is temporarily disabled.",
                LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR: "Service request limit exceeded.",
                SERVICE_KEY_IS_NOT_REGISTERED_ERROR: "Unregistered service key.",
                DEADLINE_HAS_EXPIRED_ERROR: "Service key usage period has expired.",
                UNREGISTERED_IP_ERROR: "Unregistered IP."
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

    destroy() { /* No-op */ }
}

// ===== 상수 관리자 =====
class ConstantsManager {
    constructor() {
        this.CONTENT_TYPES = {
            '12': { ko: '관광지', en: 'Tourist Destination' }, '14': { ko: '문화시설', en: 'Cultural Facility' },
            '15': { ko: '축제/공연/행사', en: 'Festival/Performance/Event' }, '25': { ko: '여행코스', en: 'Travel Course' },
            '28': { ko: '레포츠', en: 'Leisure/Sports' }, '32': { ko: '숙박', en: 'Accommodation' },
            '38': { ko: '쇼핑', en: 'Shopping' }, '39': { ko: '음식점', en: 'Restaurant' }
        };
        this.AREA_CODES = {
            '1': { ko: '서울', en: 'Seoul' }, '2': { ko: '인천', en: 'Incheon' }, '3': { ko: '대전', en: 'Daejeon' },
            '4': { ko: '대구', en: 'Daegu' }, '5': { ko: '광주', en: 'Gwangju' }, '6': { ko: '부산', en: 'Busan' },
            '7': { ko: '울산', en: 'Ulsan' }, '8': { ko: '세종', en: 'Sejong' }, '31': { ko: '경기도', en: 'Gyeonggi-do' },
            '32': { ko: '강원도', en: 'Gangwon-do' }, '33': { ko: '충청북도', en: 'Chungcheongbuk-do' },
            '34': { ko: '충청남도', en: 'Chungcheongnam-do' }, '35': { ko: '경상북도', en: 'Gyeongsangbuk-do' },
            '36': { ko: '경상남도', en: 'Gyeongsangnam-do' }, '37': { ko: '전라북도', en: 'Jeollabuk-do' },
            '38': { ko: '전라남도', en: 'Jeollanam-do' }, '39': { ko: '제주도', en: 'Jeju-do' }
        };
        this.OPERATIONS = [
            'areaBasedList', 'detailCommon', 'detailIntro', 'detailInfo', 'detailImage',
            'searchKeyword', 'searchFestival', 'locationBasedList', 'areaCode', 'categoryCode'
        ];
        this.CACHE_SETTINGS = {
            defaultTTL: 60 * 60 * 1000, // 1시간
            shortTTL: 5 * 60 * 1000,    // 5분
            longTTL: 24 * 60 * 60 * 1000 // 24시간
        };
        this.API_SETTINGS = {
            baseUrl: 'https://apis.data.go.kr/B551011/KorService2',
            defaultParams: { MobileOS: 'ETC', MobileApp: 'TourismAPI', _type: 'json' }
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

    destroy() { /* No-op */ }
}

// ===== 설정 관리자 =====
class ConfigManager {
    constructor(container) {
        this.container = container;
        this.config = {
            version: '2.1.3', // 버전 업데이트
            environment: hasProcess ? process.env.NODE_ENV || 'development' : 'browser',
            apiKey: hasProcess ? process.env.TOURISM_API_KEY : null,
            apiBaseUrl: 'https://apis.data.go.kr/B551011/KorService2',
            defaultLanguage: 'ko',
            cacheEnabled: true,
            cacheTTL: 60 * 60 * 1000, // 1시간 (AdvancedCache의 defaultTTL과 연동됨)
            rateLimitEnabled: true,
            rateLimit: 100, // 분당 요청 수
            rateLimitWindow: 60 * 1000, // 1분
            enableBatching: true,
            batchMaxOperations: 20,
            logLevel: 'info', // 'debug', 'info', 'warn', 'error'
            logFormat: 'json', // 'json' 또는 'text'
            logToConsole: true,
            // logToFile: false, // 파일 로깅은 서버리스 환경에서 권장되지 않음
            // logFilePath: './logs/tourism-api.log',
            metricsEnabled: true,
            // metricsPrefix: 'tourism_api_', // Prometheus 포맷터에서 직접 사용
            httpTimeout: 30000, // 30초 (HttpClient에서 사용)
            maxRetries: 3,      // (HttpClient에서 사용)
            retryDelay: 1000,   // 1초 (HttpClient에서 사용)
            enableCors: true,
            corsOrigins: ['*'], // 프로덕션에서는 구체적인 도메인으로 제한 권장
            // enableSecurity: true, // 보안 관련 설정은 각 모듈(예: 새니타이저)에서 처리
            // maxRequestSize: '10mb', // 서버리스 플랫폼 설정 또는 API Gateway에서 처리
            // enableCompression: true, // 서버리스 플랫폼 또는 API Gateway에서 처리
            // enableEtag: true, // 핸들러에서 처리
            // 기타 웹 기술 관련 enable 플래그들은 API 핵심 기능과 직접 관련이 적어 제거
        };
    }

    get(key, defaultValue = undefined) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }

    set(key, value) {
        this.config[key] = value;
    }

    update(updates) {
        Object.assign(this.config, updates);
    }

    getAll() {
        return { ...this.config };
    }

    hasApiKey() {
        return Boolean(this.config.apiKey);
    }

    isDevelopment() {
        return this.config.environment === 'development';
    }

    isProduction() {
        return this.config.environment === 'production';
    }

    destroy() { /* No-op */ }
}

// ===== 로거 =====
class Logger {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.logLevel = this.config.get('logLevel', 'info');
        this.logFormat = this.config.get('logFormat', 'json');
        this.logToConsole = this.config.get('logToConsole', true);
        // this.logToFile = this.config.get('logToFile', false); // 파일 로깅 비활성화
        // this.logFilePath = this.config.get('logFilePath', './logs/tourism-api.log');

        this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
        this.currentLevel = this.levels[this.logLevel] || this.levels.info;
    }

    formatMessage(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, level: level.toUpperCase(), message, ...data };

        if (this.logFormat === 'json') {
            return JSON.stringify(logEntry);
        } else {
            return `[${timestamp}] ${level.toUpperCase()}: ${message} ${Object.keys(data).length > 0 ? JSON.stringify(SafeUtils.maskSensitiveData(data)) : ''}`;
        }
    }

    log(level, message, data = {}) {
        if (this.levels[level] < this.currentLevel) {
            return;
        }

        const formattedMessage = this.formatMessage(level, message, data);

        if (this.logToConsole) {
            console[level] ? console[level](formattedMessage) : console.log(formattedMessage);
        }

        // 파일 로깅은 서버리스 환경에서 권장되지 않으므로 주석 처리 또는 제거
        // if (this.logToFile && hasProcess) {
        //     this.writeToFile(formattedMessage);
        // }
    }

    // writeToFile(message) { ... } // 파일 로깅 관련 메소드 제거 또는 주석 처리

    debug(message, data = {}) { this.log('debug', message, data); }
    info(message, data = {}) { this.log('info', message, data); }
    warn(message, data = {}) { this.log('warn', message, data); }
    error(message, data = {}) { this.log('error', message, data); }

    destroy() { /* No-op */ }
}

// ===== 고급 캐시 =====
/**
 * 메모리 기반 캐시 시스템입니다.
 * 서버리스 환경에 맞춰 setInterval을 사용한 주기적 정리를 제거하고,
 * 요청 시점 정리(on-demand cleanup)를 강화합니다.
 */
class AdvancedCache {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.logger = container.get('logger');
        this.cache = new Map();
        this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, clears: 0, expired: 0 };
        this.enabled = this.config.get('cacheEnabled', true);
        this.defaultTTL = this.config.get('cacheTTL', 60 * 60 * 1000);

        // 서버리스 환경에서는 setInterval을 사용한 백그라운드 정리가 부적합하므로 제거합니다.
        // this.cleanupInterval = setInterval(() => { this.cleanup(); }, 5 * 60 * 1000);
    }

    generateKey(operation, params = {}) {
        const sortedParams = Object.keys(params)
            .sort()
            .reduce((result, key) => {
                result[key] = params[key];
                return result;
            }, {});
        return `${operation}:${JSON.stringify(sortedParams)}`;
    }

    get(key) {
        if (!this.enabled) return null;

        const item = this.cache.get(key);

        if (!item) {
            this.stats.misses++;
            return null;
        }

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            this.stats.misses++;
            this.stats.expired++;
            this.logger.debug('Cache item expired and deleted on get', { key });
            return null;
        }

        this.stats.hits++;
        this.logger.debug('Cache hit', { key, size: this.cache.size });
        return item.value;
    }

    set(key, value, ttl = this.defaultTTL) {
        if (!this.enabled) return;

        const expiry = Date.now() + ttl;
        this.cache.set(key, { value, expiry });
        this.stats.sets++;
        this.logger.debug('Cache set', { key, ttl, size: this.cache.size });

        // 선택적: 캐시 크기가 특정 임계값을 넘으면 오래된 항목 정리 로직 추가 가능
        // if (this.cache.size > MAX_CACHE_SIZE) { this.evictOldest(); }
    }

    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.stats.deletes++;
            this.logger.debug('Cache delete', { key, size: this.cache.size });
        }
        return deleted;
    }

    clear() {
        this.cache.clear();
        this.stats.clears++;
        this.logger.info('Cache cleared');
    }

    /**
     * 만료된 캐시 항목을 정리합니다. (주로 get 호출 시 개별적으로 처리됨)
     * 이 메소드는 수동으로 호출하거나, 특정 조건에서만 호출하도록 할 수 있습니다.
     * 서버리스 환경에서는 모든 키를 순회하는 방식은 비효율적일 수 있습니다.
     */
    cleanup() {
        const now = Date.now();
        let cleanedCount = 0;
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiry) {
                this.cache.delete(key);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            this.stats.expired += cleanedCount;
            this.logger.debug('Manual cache cleanup completed', { cleaned: cleanedCount, remaining: this.cache.size });
        }
    }


    getStats() {
        const totalLookups = this.stats.hits + this.stats.misses;
        const hitRate = totalLookups > 0 ? (this.stats.hits / totalLookups) * 100 : 0;

        return {
            ...this.stats,
            size: this.cache.size,
            hitRate: parseFloat(hitRate.toFixed(2)), // 소수점 2자리
            enabled: this.enabled
        };
    }

    resetStats() {
        this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, clears: 0, expired: 0 };
        this.logger.info('Cache stats reset');
    }

    destroy() {
        // 서버리스 환경에서는 setInterval을 사용하지 않으므로 clearInterval 불필요
        this.clear(); // 컨테이너 파괴 시 캐시 비우기
        this.logger.info('AdvancedCache destroyed');
    }
}

// ===== 속도 제한기 =====
/**
 * API 요청 속도를 제한하는 클래스입니다.
 * 서버리스 환경에 맞춰 setInterval을 사용한 주기적 정리를 제거하고,
 * 요청 시점 정리(on-demand cleanup)를 활용합니다.
 */
class RateLimiter {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.logger = container.get('logger');
        this.i18n = container.get('i18n');
        this.requests = new Map(); // clientId: [timestamp1, timestamp2, ...]
        this.enabled = this.config.get('rateLimitEnabled', true);
        this.limit = this.config.get('rateLimit', 100);
        this.window = this.config.get('rateLimitWindow', 60 * 1000);
        this.stats = { totalRequests: 0, limitedRequests: 0, currentWindowRequestsForLastCheckedClient: 0 };

        // 서버리스 환경에서는 setInterval을 사용한 백그라운드 정리가 부적합하므로 제거합니다.
        // this.cleanupInterval = setInterval(() => { this.cleanupOldRequests(); }, this.window);
    }

    getClientId(req) {
        // Vercel 환경에서는 x-forwarded-for 헤더를 우선적으로 확인
        return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.headers['x-real-ip'] || req.connection?.remoteAddress || 'unknown_client';
    }

    checkLimit(req) {
        if (!this.enabled) {
            return { allowed: true, remaining: this.limit, resetTime: Date.now() + this.window };
        }

        const clientId = this.getClientId(req);
        const now = Date.now();
        const windowStart = now - this.window;

        if (!this.requests.has(clientId)) {
            this.requests.set(clientId, []);
        }

        let clientRequestTimestamps = this.requests.get(clientId);

        // 현재 윈도우 내의 유효한 요청 타임스탬프만 필터링 (오래된 기록 자동 정리)
        clientRequestTimestamps = clientRequestTimestamps.filter(timestamp => timestamp > windowStart);
        this.requests.set(clientId, clientRequestTimestamps);

        this.stats.totalRequests++;
        this.stats.currentWindowRequestsForLastCheckedClient = clientRequestTimestamps.length;

        if (clientRequestTimestamps.length >= this.limit) {
            this.stats.limitedRequests++;
            this.logger.warn('Rate limit exceeded', { clientId, requestsInWindow: clientRequestTimestamps.length, limit: this.limit });
            throw new RateLimitError(this.limit, 0, this.i18n);
        }

        clientRequestTimestamps.push(now); // 현재 요청 타임스탬프 추가
        const remaining = this.limit - clientRequestTimestamps.length;

        this.logger.debug('Rate limit check passed', { clientId, requestsInWindow: clientRequestTimestamps.length, remaining });

        return {
            allowed: true,
            remaining,
            resetTime: windowStart + this.window // 다음 윈도우 시작 시간 (대략적인 초기화 시간)
        };
    }

    /**
     * 모든 클라이언트의 만료된 요청 기록을 정리합니다. (주로 checkLimit에서 개별 클라이언트별로 처리됨)
     * 이 메소드는 수동으로 호출하거나, 특정 조건에서만 호출하도록 할 수 있습니다.
     * 서버리스 환경에서는 모든 키를 순회하는 방식은 비효율적일 수 있습니다.
     */
    cleanupOldRequests() {
        const now = Date.now();
        const windowStart = now - this.window;
        let cleanedClients = 0;
        for (const [clientId, requests] of this.requests.entries()) {
            const validRequests = requests.filter(timestamp => timestamp > windowStart);
            if (validRequests.length === 0) {
                this.requests.delete(clientId);
                cleanedClients++;
            } else {
                this.requests.set(clientId, validRequests);
            }
        }
        if (cleanedClients > 0) {
            this.logger.debug('Rate limiter old request cleanup completed for inactive clients', { cleanedClients, activeClients: this.requests.size });
        }
    }

    getStats() {
        return {
            ...this.stats,
            activeClients: this.requests.size, // 현재 추적 중인 클라이언트 수
            enabled: this.enabled,
            limit: this.limit,
            windowMs: this.window
        };
    }

    resetStats() {
        this.stats = { totalRequests: 0, limitedRequests: 0, currentWindowRequestsForLastCheckedClient: 0 };
        this.logger.info('Rate limiter stats reset');
    }

    destroy() {
        // 서버리스 환경에서는 setInterval을 사용하지 않으므로 clearInterval 불필요
        this.requests.clear();
        this.logger.info('RateLimiter destroyed');
    }
}

// ===== HTTP 클라이언트 =====
class HttpClient {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.logger = container.get('logger');
        this.i18n = container.get('i18n');
        this.baseUrl = this.config.get('apiBaseUrl');
        this.timeout = this.config.get('httpTimeout', 30000);
        this.maxRetries = this.config.get('maxRetries', 3);
        this.retryDelay = this.config.get('retryDelay', 1000);
    }

    async request(operation, params = {}, options = {}) {
        const startTime = Date.now();
        const apiKey = this.config.get('apiKey');

        if (!apiKey) {
            throw new TourismApiError('MISSING_API_KEY', operation, 500, {}, {}, this.i18n);
        }

        const url = new URL(`${this.baseUrl}/${operation}`);
        const searchParams = new URLSearchParams();
        searchParams.append('ServiceKey', apiKey);

        const constants = this.container.get('constants');
        const defaultParams = constants.API_SETTINGS.defaultParams;
        Object.entries(defaultParams).forEach(([key, value]) => {
            searchParams.append(key, String(value));
        });

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                searchParams.append(key, String(value));
            }
        });
        url.search = searchParams.toString();

        this.logger.debug('HTTP request starting', {
            operation,
            url: url.toString().replace(apiKey, '***MASKED***'), // 로그에는 API 키 마스킹
            params: SafeUtils.maskSensitiveData(params)
        });

        let lastError;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await this.makeRequest(url.toString(), operation, options); // operation 전달
                const duration = Date.now() - startTime;
                this.logger.info('HTTP request completed', { operation, attempt, duration, status: response.status });
                return response;
            } catch (error) {
                lastError = error;
                const duration = Date.now() - startTime;
                this.logger.warn('HTTP request failed', { operation, attempt, duration, error: error.message, stack: error.stack });
                if (attempt < this.maxRetries && this.shouldRetry(error)) {
                    await SafeUtils.sleep(this.retryDelay * attempt);
                    this.logger.info(`Retrying HTTP request for ${operation}, attempt ${attempt + 1}`);
                    continue;
                }
                break;
            }
        }
        throw lastError;
    }

    async makeRequest(urlString, operation, options = {}) { // operation 파라미터 추가
        if (hasProcess) {
            return this.makeNodeRequest(urlString, operation, options);
        } else {
            return this.makeBrowserRequest(urlString, operation, options);
        }
    }

    async makeNodeRequest(urlString, operation, options = {}) { // operation 파라미터 추가
        return new Promise((resolve, reject) => {
            const urlObj = new URL(urlString);
            const httpModule = urlObj.protocol === 'https:' ? require('https') : require('http');

            const requestOptions = {
                method: 'GET', // 대부분의 공공 API는 GET 사용
                timeout: this.timeout,
                headers: {
                    'User-Agent': `TourismAPI/${this.config.get('version', 'unknown')}`,
                    'Accept': 'application/json',
                    ...options.headers
                }
            };

            const req = httpModule.request(urlObj, requestOptions, (res) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve({
                            status: res.statusCode,
                            statusText: res.statusMessage,
                            data: jsonData,
                            headers: res.headers
                        });
                    } catch (parseError) {
                        this.logger.error('Failed to parse API JSON response', { operation, responseData: data, parseError: parseError.message });
                        reject(new TourismApiError('API_RESPONSE_ERROR', operation, 500, { reason: 'JSON parse error', parseError: parseError.message, responsePreview: data.substring(0, 200) }, {}, this.i18n));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy(new Error('Request timed out')); // 에러 객체와 함께 destroy
                reject(new ApiTimeoutError(this.timeout, operation, this.i18n));
            });

            req.on('error', (networkError) => {
                reject(new TourismApiError('NETWORK_ERROR', operation, 503, { networkError: networkError.message }, {}, this.i18n));
            });

            req.end();
        });
    }

    async makeBrowserRequest(urlString, operation, options = {}) { // operation 파라미터 추가
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(urlString, {
                method: 'GET',
                signal: controller.signal,
                headers: { 'Accept': 'application/json', ...options.headers }
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorBody = null;
                try { errorBody = await response.json(); } catch (e) { /* ignore */ }
                throw new TourismApiError('API_RESPONSE_ERROR', operation, response.status, { status: response.status, statusText: response.statusText, body: errorBody }, {}, this.i18n);
            }

            const data = await response.json();
            return { status: response.status, statusText: response.statusText, data, headers: Object.fromEntries(response.headers.entries()) };
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new ApiTimeoutError(this.timeout, operation, this.i18n);
            }
            if (error instanceof TourismApiError) { throw error; } // 이미 처리된 에러
            throw new TourismApiError('NETWORK_ERROR', operation, 500, { networkError: error.message }, {}, this.i18n);
        }
    }

    shouldRetry(error) {
        if (error instanceof ApiTimeoutError) return true;
        if (error instanceof TourismApiError) {
            // 5xx 서버 오류 또는 네트워크 오류 시 재시도
            return error.statusCode >= 500 || error.code === 'NETWORK_ERROR' || error.statusCode === 429; // 429(Too Many Requests)도 재시도 대상에 포함 가능
        }
        return false;
    }

    destroy() { /* No-op */ }
}

// ===== API 응답 처리기 =====
/**
 * API 응답을 처리하고 검증하는 클래스입니다.
 * HTML 콘텐츠 새니타이징 시 전문 라이브러리 사용이 권장됩니다.
 */
class ApiResponseProcessor {
    constructor(container) {
        this.container = container;
        this.logger = container.get('logger');
        this.i18n = container.get('i18n');
        this.constants = container.get('constants');
        // HTML 새니타이징을 위해 isomorphic-dompurify와 같은 라이브러리를 여기서 초기화하거나,
        // 필요시 enhanceItem 메소드 내에서 require/import 할 수 있습니다.
        // 예: this.DOMPurify = require('isomorphic-dompurify'); (사전에 npm install isomorphic-dompurify 필요)
    }

    async processResponse(response, operation) {
        this.logger.debug('Processing API response', { operation, status: response.status });

        if (response.status !== 200) { // 공공 API는 종종 오류도 200으로 주지만, 일반적인 HTTP 오류 처리
            throw new TourismApiError('API_RESPONSE_ERROR', operation, response.status, { status: response.status, statusText: response.statusText, responseData: response.data }, {}, this.i18n);
        }

        const data = response.data;
        if (!data || typeof data !== 'object' || !data.response || !data.response.header) {
            this.logger.error('Invalid API response structure', { operation, responseData: data });
            throw new TourismApiError('API_RESPONSE_ERROR', operation, 500, { reason: 'Invalid response structure from API', responsePreview: JSON.stringify(data).substring(0,200) }, {}, this.i18n);
        }

        const resultCode = data.response.header.resultCode;
        const resultMsg = data.response.header.resultMsg;

        if (resultCode !== '0000') { // '0000'이 성공 코드
            const errorCode = this.mapApiErrorCode(resultCode);
            let statusCode = 400; // 기본적으로 클라이언트 오류로 간주
            if (errorCode.startsWith('SERVICE_') || errorCode.startsWith('DB_') || errorCode.startsWith('APPLICATION_') || errorCode === 'API_LOGIC_ERROR') {
                statusCode = 500; // 서버 측 문제로 간주될 수 있는 경우
            }
            if (errorCode === 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR') statusCode = 429;
            if (errorCode === 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' || errorCode === 'DEADLINE_HAS_EXPIRED_ERROR' || errorCode === 'SERVICE_ACCESS_DENIED_ERROR') statusCode = 401; // 또는 403

            this.logger.warn('API returned an error code', { operation, resultCode, resultMsg });
            throw new TourismApiError(errorCode, operation, statusCode, { resultCode, resultMsg }, {}, this.i18n);
        }

        const processedData = this.enhanceResponseData(data, operation);
        this.logger.debug('API response processed successfully', { operation, itemCount: this.getItemCount(processedData) });
        return processedData;
    }

    mapApiErrorCode(apiErrorCode) {
        // 한국관광공사 API 문서 기준 주요 에러 코드 매핑
        const errorCodeMap = {
            '0001': 'APPLICATION_ERROR', // 어플리케이션 에러
            '0002': 'DB_ERROR',          // 데이터베이스 에러
            '0003': 'NODATA_ERROR',       // 데이터없음 에러
            '0004': 'HTTP_ERROR',         // HTTP 에러
            '0005': 'SERVICETIMEOUT_ERROR',// 서비스 타임아웃
            '0010': 'INVALID_REQUEST_PARAMETER_ERROR', // 잘못된 요청 파라메터 에러
            '0011': 'NO_MANDATORY_REQUEST_PARAMETERS_ERROR', // 필수요청 파라메터가 없음
            '0012': 'END_OF_SERVICE_ERROR', // 해당 오픈 API 서비스가 없거나 폐기됨
            '0020': 'SERVICE_ACCESS_DENIED_ERROR', // 서비스 접근거부 에러
            '0021': 'TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR', // 일시적으로 사용할 수 없는 서비스키
            '0022': 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR', // 서비스 요청제한횟수 초과에러
            '0030': 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR', // 등록되지 않은 서비스키
            '0031': 'DEADLINE_HAS_EXPIRED_ERROR', // 서비스 키 사용기간 만료
            '0032': 'UNREGISTERED_IP_ERROR',   // 등록되지 않은 IP
            '9999': 'UNKNOWN_ERROR' // 기타에러
        };
        return errorCodeMap[apiErrorCode] || `API_LOGIC_ERROR_CODE_${apiErrorCode}`; // 매핑 안된 코드는 그대로 노출
    }

    enhanceResponseData(data, operation) {
        const enhanced = { ...data };
        if (data.response?.body?.items) {
            const itemsData = data.response.body.items.item;
            // item이 단일 객체로 올 경우 배열로 만들어 일관성 유지
            const itemsArray = Array.isArray(itemsData) ? itemsData : (itemsData ? [itemsData] : []);
            enhanced.response.body.items.item = this.enhanceItems(itemsArray, operation);
        }
        return enhanced;
    }

    enhanceItems(items, operation) {
        if (!Array.isArray(items)) return [];
        return items.map(item => this.enhanceItem(item, operation));
    }

    enhanceItem(item, operation) {
        const enhanced = { ...item };
        const lang = this.i18n.getCurrentLanguage();

        if (item.contenttypeid) {
            enhanced.contentTypeName = this.constants.getContentTypeName(item.contenttypeid, lang);
        }
        if (item.areacode) {
            enhanced.areaName = this.constants.getAreaName(item.areacode, lang);
        }
        if (item.homepage) {
            enhanced.homepage = this.cleanupHomepage(item.homepage);
        }
        if (item.mapx && item.mapy) {
            enhanced.coordinates = {
                longitude: SafeUtils.safeParseFloat(item.mapx),
                latitude: SafeUtils.safeParseFloat(item.mapy),
                isValid: GeoUtils.isValidCoordinate(item.mapy, item.mapx)
            };
        }

        // overview 필드와 같이 HTML을 포함할 수 있는 경우, 전문 라이브러리로 새니타이징
        // 예시: isomorphic-dompurify 사용 (라이브러리 설치 및 import 필요)
        // if (item.overview && this.DOMPurify) { // DOMPurify 인스턴스가 있다고 가정
        //   enhanced.overview = this.DOMPurify.sanitize(item.overview, {
        //     ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'a'],
        //     ALLOWED_ATTR: ['href', 'target']
        //   });
        // } else if (item.overview) {
        //   // DOMPurify가 없을 경우, SafeUtils.sanitizeInput 사용 (덜 안전함)
        //   enhanced.overview = SafeUtils.sanitizeInput(item.overview, 4000, {
        //      allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'a']
        //   });
        // }
        // 현재는 SafeUtils.sanitizeInput을 사용하도록 두되, 주석으로 강력 권고
        if (item.overview) {
             enhanced.overview = SafeUtils.sanitizeInput(item.overview, 4000, {
                 allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'div', 'span']
                 // 주의: allowedTags가 많아질수록 XSS 위험 증가. 반드시 isomorphic-dompurify 사용 고려.
                 // img 태그의 src, a 태그의 href 등 속성 필터링이 중요.
             });
        }


        // 추가적으로 날짜 포맷팅, 카테고리명 변환 등을 여기에 추가할 수 있습니다.
        // 예: if (item.createdtime) enhanced.createdtimeISO = this.formatDateToISO(item.createdtime);

        return enhanced;
    }

    cleanupHomepage(homepage) {
        if (!homepage || typeof homepage !== 'string') return null;
        let cleaned = homepage.replace(/<[^>]*>/g, '').trim(); // 기본적인 HTML 태그 제거
        if (!cleaned) return null;

        // URL 유효성 검사 및 프로토콜 추가 시도
        if (SafeUtils.isValidUrl(cleaned)) return cleaned;
        if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
            const withHttp = `http://${cleaned}`;
            if (SafeUtils.isValidUrl(withHttp)) return withHttp;
        }
        this.logger.warn('Invalid homepage URL detected after cleanup', { original: homepage, cleaned });
        return null; // 유효하지 않으면 null 반환
    }

    getItemCount(data) {
        const items = data.response?.body?.items?.item;
        if (!items) return 0;
        return Array.isArray(items) ? items.length : 1; // 단일 아이템도 1로 카운트
    }

    destroy() { /* No-op */ }
}

// ===== 입력 검증기 =====
class InputValidator {
    constructor(container) {
        this.container = container;
        this.logger = container.get('logger');
        this.i18n = container.get('i18n');
        this.constants = container.get('constants');
    }

    validateParams(operation, params) {
        this.logger.debug('Validating input parameters', { operation, params: SafeUtils.maskSensitiveData(params) });

        if (!this.constants.isValidOperation(operation)) {
            throw new ValidationError(this.i18n.getMessage('UNSUPPORTED_OPERATION', { operation }), 'operation', operation, this.i18n);
        }

        const validated = {};
        const rules = this.getValidationRules(operation);

        for (const [key, rule] of Object.entries(rules)) {
            const value = params[key];
            try {
                validated[key] = this.validateField(key, value, rule);
            } catch (error) {
                if (error instanceof ValidationError) throw error; // 이미 ValidationError면 그대로 throw
                // 그 외의 경우 ValidationError로 래핑
                this.logger.warn('Unexpected error during field validation', { field: key, value, rule, error: error.message });
                throw new ValidationError(error.message, key, value, this.i18n);
            }
        }
        
        // 작업별 추가 비즈니스 로직 검증
        this.performOperationSpecificValidation(operation, validated);

        this.logger.debug('Input validation completed', { operation, validatedParams: SafeUtils.maskSensitiveData(validated) });
        return validated;
    }

    validateField(fieldName, value, rule) {
        // 1. 기본값 처리: 값이 제공되지 않았고 기본값이 정의된 경우
        if ((value === undefined || value === null || String(value).trim() === '') && rule.default !== undefined) {
            return rule.default;
        }

        // 2. 필수 필드 검증: 기본값 처리 후에도 값이 없는 경우
        if (rule.required && (value === undefined || value === null || String(value).trim() === '')) {
            throw new ValidationError(this.i18n.getMessage('NO_MANDATORY_REQUEST_PARAMETERS_ERROR') + `: ${fieldName}`, fieldName, value, this.i18n);
        }
        
        // 3. 값이 없는 비필수 필드는 더 이상 검증하지 않음
        if (value === undefined || value === null || String(value).trim() === '') {
            return value; // 또는 undefined나 null을 명시적으로 반환
        }


        // 4. 타입 검증 및 변환
        let validatedValue = this.validateType(fieldName, value, rule.type);

        // 5. 추가 검증 (길이, 범위, 열거형, 패턴, 사용자 정의) - validatedValue에 대해 수행
        if (rule.minLength !== undefined || rule.maxLength !== undefined) {
            this.validateLength(fieldName, validatedValue, rule.minLength, rule.maxLength);
        }
        if (rule.min !== undefined || rule.max !== undefined) {
            this.validateRange(fieldName, validatedValue, rule.min, rule.max);
        }
        if (rule.enum) {
            this.validateEnum(fieldName, validatedValue, rule.enum);
        }
        if (rule.pattern) {
            this.validatePattern(fieldName, validatedValue, rule.pattern);
        }
        if (rule.custom && typeof rule.custom === 'function') {
            validatedValue = rule.custom(validatedValue, fieldName, this.i18n); // custom validator에 i18n 전달
        }
        return validatedValue;
    }

    validateType(fieldName, value, type) {
        switch (type) {
            case 'string': return String(value);
            case 'number':
                const num = SafeUtils.safeParseFloat(value);
                if (isNaN(num)) throw new ValidationError(this.i18n.getMessage('NUMERIC_ERROR', { field: fieldName }), fieldName, value, this.i18n);
                return num;
            case 'integer':
                const int = SafeUtils.safeParseInt(value);
                if (isNaN(int)) throw new ValidationError(this.i18n.getMessage('NUMERIC_ERROR', { field: fieldName }) + " (정수 필요)", fieldName, value, this.i18n);
                return int;
            case 'boolean':
                if (typeof value === 'boolean') return value;
                if (typeof value === 'string') {
                    const lower = value.toLowerCase();
                    if (lower === 'true' || lower === '1' || lower === 'y') return true;
                    if (lower === 'false' || lower === '0' || lower === 'n') return false;
                }
                throw new ValidationError(this.i18n.getMessage('INVALID_FORMAT', { field: fieldName }) + " (boolean 필요)", fieldName, value, this.i18n);
            default: return value; // 정의되지 않은 타입은 원본 값 반환
        }
    }

    validateLength(fieldName, value, minLength, maxLength) {
        const strValue = String(value); // 숫자도 문자열로 변환 후 길이 체크
        if (minLength !== undefined && strValue.length < minLength) {
            throw new ValidationError(this.i18n.getMessage('MIN_LENGTH_ERROR', { field: fieldName, minLength, actual: strValue.length }), fieldName, value, this.i18n);
        }
        if (maxLength !== undefined && strValue.length > maxLength) {
            throw new ValidationError(this.i18n.getMessage('MAX_LENGTH_ERROR', { field: fieldName, maxLength, actual: strValue.length }), fieldName, value, this.i18n);
        }
    }

    validateRange(fieldName, value, min, max) {
        // value는 이미 validateType을 통해 숫자로 변환되었음을 가정
        if (min !== undefined && value < min) {
            throw new ValidationError(this.i18n.getMessage('INVALID_RANGE', { field: fieldName, min, max: max ?? '∞' }), fieldName, value, this.i18n);
        }
        if (max !== undefined && value > max) {
            throw new ValidationError(this.i18n.getMessage('INVALID_RANGE', { field: fieldName, min: min ?? '-∞', max }), fieldName, value, this.i18n);
        }
    }

    validateEnum(fieldName, value, enumValues) {
        // value가 문자열이 아닐 수도 있으므로, enumValues도 비교를 위해 문자열화 하거나 타입을 맞춤
        const strValue = String(value);
        const strEnumValues = enumValues.map(String);
        if (!strEnumValues.includes(strValue)) {
            throw new ValidationError(this.i18n.getMessage('ENUM_ERROR', { field: fieldName, values: enumValues.join(', ') }), fieldName, value, this.i18n);
        }
    }

    validatePattern(fieldName, value, pattern) {
        if (!pattern.test(String(value))) { // 정규식은 문자열에 대해 테스트
            throw new ValidationError(this.i18n.getMessage('INVALID_FORMAT', { field: fieldName }) + `: ${pattern.toString()}`, fieldName, value, this.i18n);
        }
    }
    
    performOperationSpecificValidation(operation, params) {
        // 예: 축제 검색 시 시작일이 종료일보다 늦으면 안됨
        if (operation === 'searchFestival' && params.eventStartDate && params.eventEndDate) {
            if (parseInt(params.eventStartDate, 10) > parseInt(params.eventEndDate, 10)) {
                throw new ValidationError(
                    '축제 시작일은 종료일보다 이전이거나 같아야 합니다.',
                    'eventStartDate/eventEndDate',
                    `${params.eventStartDate}-${params.eventEndDate}`,
                    this.i18n
                );
            }
        }
        // 예: 위치 기반 검색 시 mapX, mapY 좌표 유효성
        if (operation === 'locationBasedList' && params.mapX && params.mapY) {
            if (!GeoUtils.isValidCoordinate(params.mapY, params.mapX)) { // mapY가 위도, mapX가 경도
                 throw new ValidationError(this.i18n.getMessage('INVALID_COORDINATES', { lat: params.mapY, lng: params.mapX }), 'mapX/mapY', `${params.mapX},${params.mapY}`, this.i18n);
            }
        }
    }


    getValidationRules(operation) {
        // 공통 파라미터 규칙
        const commonPaginationRules = {
            numOfRows: { type: 'integer', min: 1, max: 1000, default: 10 },
            pageNo: { type: 'integer', min: 1, default: 1 },
        };
        const commonArrangeRule = {
             arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'O', 'P', 'Q', 'R'], default: 'A' } // API별로 유효한 arrange 값이 다를 수 있음, 필요시 오버라이드
        };
        const commonContentFilterRules = {
            contentTypeId: { type: 'string', enum: Object.keys(this.constants.CONTENT_TYPES), required: false }, // API에 따라 필수가 될 수 있음
            areaCode: { type: 'string', enum: Object.keys(this.constants.AREA_CODES), required: false },
            sigunguCode: { type: 'string', pattern: /^\d*$/, required: false }, // 숫자로만 구성, 비어있을 수 있음
            cat1: { type: 'string', pattern: /^[A-Z]\d{2}$/, required: false },
            cat2: { type: 'string', pattern: /^[A-Z]\d{4}$/, required: false },
            cat3: { type: 'string', pattern: /^[A-Z]\d{6}$/, required: false },
        };
        
        // 작업별 특정 규칙
        const operationRules = {
            areaBasedList: {
                ...commonPaginationRules,
                ...commonArrangeRule, // areaBasedList는 'E'(거리순) 포함
                ...commonContentFilterRules,
                listYN: { type: 'string', enum: ['Y', 'N'], default: 'Y'},
                modifiedtime: { type: 'string', pattern: /^\d{14}$/, required: false } // YYYYMMDDHHMMSS
            },
            detailCommon: {
                contentId: { type: 'string', required: true, pattern: /^\d+$/ },
                contentTypeId: { type: 'string', enum: Object.keys(this.constants.CONTENT_TYPES), required: false }, // contentId만으로 조회가 가능할 수 있음
                defaultYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
                firstImageYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
                areacodeYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
                catcodeYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
                addrinfoYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
                mapinfoYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
                overviewYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' }
            },
            detailIntro: {
                contentId: { type: 'string', required: true, pattern: /^\d+$/ },
                contentTypeId: { type: 'string', enum: Object.keys(this.constants.CONTENT_TYPES), required: true }
            },
            detailInfo: {
                contentId: { type: 'string', required: true, pattern: /^\d+$/ },
                contentTypeId: { type: 'string', enum: Object.keys(this.constants.CONTENT_TYPES), required: true }
            },
            detailImage: {
                ...commonPaginationRules,
                contentId: { type: 'string', required: true, pattern: /^\d+$/ },
                imageYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
                subImageYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            },
            searchKeyword: {
                ...commonPaginationRules,
                arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'O', 'P', 'Q', 'R'], default: 'A' }, // 'E' 제외
                ...commonContentFilterRules,
                keyword: { type: 'string', required: true, minLength: 1, maxLength: 100 },
                listYN: { type: 'string', enum: ['Y', 'N'], default: 'Y'},
            },
            searchFestival: {
                ...commonPaginationRules,
                arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'O', 'Q', 'R'], default: 'A' }, // 'E', 'P' 제외
                areaCode: commonContentFilterRules.areaCode,
                sigunguCode: commonContentFilterRules.sigunguCode,
                eventStartDate: { type: 'string', pattern: /^\d{8}$/, required: true }, // YYYYMMDD
                eventEndDate: { type: 'string', pattern: /^\d{8}$/, required: false }, // YYYYMMDD
                modifiedtime: { type: 'string', pattern: /^\d{14}$/, required: false }
            },
            locationBasedList: {
                ...commonPaginationRules,
                arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'], default: 'A' }, // 'E' (거리순) 필수적 의미
                contentTypeId: commonContentFilterRules.contentTypeId,
                mapX: { type: 'number', required: true /*, min:-180, max:180 (GeoUtils에서 검증) */ }, // 경도
                mapY: { type: 'number', required: true /*, min:-90, max:90 (GeoUtils에서 검증) */ },   // 위도
                radius: { type: 'integer', required: true, min: 1, max: 20000, default: 1000 }, // 미터 단위
                listYN: { type: 'string', enum: ['Y', 'N'], default: 'Y'},
                modifiedtime: { type: 'string', pattern: /^\d{14}$/, required: false }
            },
            areaCode: {
                ...commonPaginationRules,
                areaCode: { type: 'string', enum: Object.keys(this.constants.AREA_CODES), required: false } // 특정 지역의 시군구 조회시 사용
            },
            categoryCode: {
                ...commonPaginationRules,
                contentTypeId: { type: 'string', enum: Object.keys(this.constants.CONTENT_TYPES), required: false },
                cat1: commonContentFilterRules.cat1,
                cat2: commonContentFilterRules.cat2,
                cat3: commonContentFilterRules.cat3, // API 문서에는 cat3 파라미터가 명시되어 있지 않으나, 구조상 포함
            }
        };
        return operationRules[operation] || {};
    }


    destroy() { /* No-op */ }
}

// ===== 메인 API 클래스 =====
class AllTourismAPI {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.logger = container.get('logger');
        this.cache = container.get('cache');
        this.rateLimiter = container.get('rateLimiter');
        this.httpClient = container.get('httpClient');
        this.responseProcessor = container.get('responseProcessor');
        this.inputValidator = container.get('inputValidator');
        this.i18n = container.get('i18n');
    }

    async request(operation, params = {}, req = null) { // req는 속도 제한용 HTTP 요청 객체
        const startTime = Date.now();
        const requestId = SafeUtils.generateRequestId();
        let responseResult = null;

        this.logger.info('API request received', { requestId, operation, params: SafeUtils.maskSensitiveData(params) });

        try {
            if (req && this.config.get('rateLimitEnabled')) { // rateLimiter 사용 여부 설정값 확인
                this.rateLimiter.checkLimit(req);
            }

            const validatedParams = this.inputValidator.validateParams(operation, params);
            const cacheKey = this.cache.generateKey(operation, validatedParams);

            if (this.config.get('cacheEnabled')) { // cache 사용 여부 설정값 확인
                const cachedResult = this.cache.get(cacheKey);
                if (cachedResult) {
                    const duration = Date.now() - startTime;
                    this.logger.info('API request completed (from cache)', { requestId, operation, duration });
                    return ResponseFormatter.addCacheInfo(cachedResult, true, { key: cacheKey, hitTime: new Date().toISOString() });
                }
            }

            const httpResponse = await this.httpClient.request(operation, validatedParams);
            const processedData = await this.responseProcessor.processResponse(httpResponse, operation);
            
            // 위치 기반 검색 결과에 거리 정보 추가 (만약 API가 기본으로 제공하지 않는다면)
            if ((operation === 'locationBasedList' || operation === 'areaBasedList') && validatedParams.mapX && validatedParams.mapY && processedData.response?.body?.items?.item) {
                 if (!processedData.response.body.items.item.some(it => it.distance !== undefined)) { // API 응답에 distance가 없다면
                    this.addDistanceInfoToItems(processedData, validatedParams);
                 }
            }


            responseResult = ResponseFormatter.formatSuccess(
                operation,
                processedData,
                { requestId, validatedParams: SafeUtils.maskSensitiveData(validatedParams) },
                { duration: Date.now() - startTime, cached: false }
            );

            if (this.config.get('cacheEnabled')) {
                this.cache.set(cacheKey, responseResult); // 전체 응답 객체 캐싱
            }

            const duration = Date.now() - startTime;
            this.logger.info('API request completed (from API)', { requestId, operation, duration, itemCount: this.responseProcessor.getItemCount(processedData) });
            return responseResult;

        } catch (error) {
            const duration = Date.now() - startTime;
            // BaseError의 인스턴스이고, 이미 operation 정보가 있다면 그것을 사용
            const errorOperation = (error instanceof BaseError && error.operation) ? error.operation : operation;
            this.logger.error('API request failed', { requestId, operation: errorOperation, duration, error: error.message, errorCode: error.code, statusCode: error.statusCode, details: error.details, stack: error.stack });
            
            // formatError는 BaseError가 아니면 기본 operation을 사용하므로, error 객체에 operation을 명시적으로 넣어줄 수 있음
            if (!(error instanceof BaseError)) {
                error.operation = operation; // 일반 Error 객체에 operation 추가
            }
            return ResponseFormatter.formatError(error, errorOperation);
        }
    }
    
    addDistanceInfoToItems(processedData, params) {
        const items = processedData.response.body.items.item;
        if (Array.isArray(items) && params.mapY && params.mapX && params.radius) {
            const userLat = params.mapY; // 이미 validateType에서 숫자로 변환됨
            const userLng = params.mapX;
            const radius = params.radius;
            
            // GeoUtils.addDistanceInfo는 아이템 배열을 직접 수정하지 않고 새 배열을 반환하므로, 결과를 다시 할당해야 함.
            // 또한, 필터링 및 정렬 기능이 포함되어 있으므로 주의.
            // 여기서는 거리 정보만 추가하고, 필터링/정렬은 API 파라미터 또는 클라이언트에서 처리하도록 가정.
            processedData.response.body.items.item = items.map(item => {
                const itemLat = SafeUtils.safeParseFloat(item.mapy);
                const itemLng = SafeUtils.safeParseFloat(item.mapx);
                if (GeoUtils.isValidCoordinate(itemLat, itemLng)) {
                    item.distance = GeoUtils.getDistance(userLat, userLng, itemLat, itemLng);
                }
                return item;
            }).sort((a,b) => (a.distance === undefined && b.distance === undefined) ? 0 : (a.distance === undefined) ? 1 : (b.distance === undefined) ? -1 : a.distance - b.distance);
            // 만약 API에서 이미 거리순 정렬(arrange='E')을 지원하고 사용했다면, 여기서 재정렬은 불필요하거나 의도와 다를 수 있음.
        }
    }


    destroy() {
        this.logger.info('AllTourismAPI instance destroyed');
        // 각 의존성들도 destroy 메소드가 있다면 호출
        // this.cache.destroy();
        // this.rateLimiter.destroy();
        // ...
    }
}

// ===== 서비스 컨테이너 설정 =====
function createServiceContainer() {
    const container = new ServiceContainer();
    container
        .register('config', (c) => new ConfigManager(c))
        .register('i18n', () => new InternationalizationManager()) // i18n은 다른 서비스에 의존하지 않음
        .register('constants', () => new ConstantsManager())     // constants도 다른 서비스에 의존하지 않음
        .register('logger', (c) => new Logger(c))
        .register('cache', (c) => new AdvancedCache(c))
        .register('rateLimiter', (c) => new RateLimiter(c))
        .register('httpClient', (c) => new HttpClient(c))
        .register('responseProcessor', (c) => new ApiResponseProcessor(c))
        .register('inputValidator', (c) => new InputValidator(c))
        .register('api', (c) => new AllTourismAPI(c));
    
    container.initialize(); // 모든 서비스 인스턴스화
    return container;
}

// ===== 전역 컨테이너 인스턴스 관리 =====
// 서버리스 환경에서는 매 요청마다 새로운 컨테이너를 생성하거나,
// 컨테이너 재사용 시 상태 초기화를 보장해야 합니다.
// 여기서는 요청마다 컨테이너를 가져오고, 핸들러 종료 시 destroy를 호출합니다.
let globalContainerInstance = null;

function getGlobalContainer() {
    if (!globalContainerInstance || !globalContainerInstance.isInitialized()) {
        globalContainerInstance = createServiceContainer();
    }
    return globalContainerInstance;
}

// ===== 서버리스 핸들러 함수들 =====
async function mainHandler(req, res, operationExtractor) {
    let container; // try 블록 외부에서 선언
    let api;
    let logger;
    let config;
    const requestId = SafeUtils.generateRequestId(); // 요청 ID 먼저 생성
    const startTime = Date.now();

    try {
        container = getGlobalContainer(); // 요청 시작 시 컨테이너 가져오기 또는 생성
        api = container.get('api');
        logger = container.get('logger');
        config = container.get('config');

        // CORS 헤더 설정 (ConfigManager 설정값에 따라)
        if (config.get('enableCors', true)) {
            const corsOrigins = config.get('corsOrigins', ['*']); // 기본값 '*'
            const requestOrigin = req.headers.origin;
            
            // 요청 Origin이 허용 목록에 있거나, 허용 목록이 '*'인 경우
            if (corsOrigins.includes('*') || (requestOrigin && corsOrigins.includes(requestOrigin))) {
                res.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');
            } else if (corsOrigins.length > 0 && !corsOrigins.includes('*')) {
                 // 구체적인 Origin 목록이 있고, 요청 Origin이 매칭되지 않으면 CORS 헤더를 설정하지 않거나 특정 값으로 설정
                 // 여기서는 요청 Origin이 허용 목록에 없으면 '*'도 설정하지 않도록 수정 (더 안전)
                 logger.warn('CORS: Request origin not in allowed list.', { requestOrigin, allowedOrigins: corsOrigins });
            }

            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY'); // X-API-KEY 등 커스텀 헤더 허용
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Max-Age', '86400'); // 24시간
        }

        if (req.method === 'OPTIONS') {
            res.status(204).end(); // No Content for pre-flight
            return;
        }
        
        const { operation, params } = operationExtractor(req);

        if (!operation) {
            throw new ValidationError('Operation parameter is required.', 'operation', undefined, container.get('i18n'));
        }
        
        // 헬스체크, 메트릭스 등 특수 핸들러는 AllTourismAPI 클래스 외부에서 처리하거나,
        // AllTourismAPI 클래스 내에 메소드로 구현 후 여기서 호출할 수 있습니다.
        // 여기서는 AllTourismAPI.request를 통하는 것으로 가정.
        // 또는, operation에 따라 분기하여 특수 함수 호출

        const result = await api.request(operation, params, req); // req 객체를 rateLimiter에 전달

        // ETag 설정 (ConfigManager 설정값에 따라)
        if (config.get('enableEtag', true) && result.success && result.data) {
            try {
                const etagPayload = JSON.stringify(result.data); // 데이터 부분만으로 ETag 생성
                // crypto 모듈을 사용하여 더 강력한 해시 ETag 생성 권장
                // const crypto = require('crypto');
                // const etag = `"${crypto.createHash('md5').update(etagPayload).digest('hex')}"`;
                // 간단한 Base64 ETag (Vercel은 자동 ETag 생성 기능도 있음)
                const etag = `W/"${Buffer.from(etagPayload).toString('base64')}"`; // 약한 ETag
                res.setHeader('ETag', etag);

                // Cache-Control 헤더 설정 (선택적)
                // res.setHeader('Cache-Control', 'public, max-age=3600'); // 예: 1시간
            } catch (etagError) {
                logger.warn('Failed to generate ETag', { error: etagError.message });
            }
        }
        
        const responseStatusCode = result.success ? 200 : (result.error?.statusCode || 500);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(responseStatusCode).json(result);

    } catch (error) { // 핸들러 수준의 예외 처리
        const localLogger = container ? container.get('logger') : console; // 컨테이너 생성 전 에러 대비
        localLogger.error('Unhandled error in mainHandler', {
            requestId, // 요청 ID 로깅
            error: error.message,
            stack: error.stack,
            method: req.method,
            url: req.url
        });
        
        const i18nInstance = container ? container.get('i18n') : new InternationalizationManager(); // 임시 i18n
        const errorResponse = ResponseFormatter.formatError(error, error.operation || 'handlerError'); // operation 정보가 있으면 사용
        const responseStatusCode = errorResponse.error?.statusCode || 500;

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(responseStatusCode).json(errorResponse);
    } finally {
        if (container && typeof container.destroy === 'function') {
            // 서버리스 환경에서는 destroy 호출이 필수는 아닐 수 있으나,
            // 명시적인 리소스 정리(예: DB 커넥션 풀)가 있다면 유용합니다.
            // 현재 코드에서는 주로 Map 클리어 및 로그 출력 정도.
            // container.destroy(); // 매 요청마다 파괴하면 초기화 비용 발생. 인스턴스 재사용 시 상태 관리가 중요.
            // 여기서는 destroy를 호출하지 않고, 플랫폼의 인스턴스 관리에 맡기되,
            // 내부 서비스들이 상태를 공유하지 않도록 설계하는 것이 더 중요.
            // 만약 destroy가 필수적인 서비스가 있다면, 그 서비스만 특정 시점에 정리.
            logger?.info('Request processing finished.', { requestId, duration: Date.now() - startTime });
        }
    }
}


function defaultOperationExtractor(req) {
    let operation, params;
    if (req.method === 'GET') {
        operation = req.query.operation;
        params = { ...req.query };
        delete params.operation;
    } else if (req.method === 'POST') {
        // Vercel/Next.js는 req.body를 자동으로 파싱해줌
        const body = req.body || {}; 
        operation = body.operation;
        params = { ...body };
        delete params.operation;
    } else {
        // 이 부분은 mainHandler try-catch 외부에서 발생할 수 있으므로, mainHandler 내부로 옮기거나 별도 처리 필요.
        // 여기서는 mainHandler 내부에서 처리한다고 가정하고, 이 함수는 단순히 추출만 담당.
        // throw new ValidationError('Only GET and POST methods are supported', 'method', req.method);
        return { operation: null, params: null}; // 오류는 mainHandler에서 처리
    }
    return { operation, params };
}

async function handler(req, res) {
    return mainHandler(req, res, defaultOperationExtractor);
}

async function batchHandler(req, res) {
    // 배치 핸들러는 요청 본문에서 operations 배열을 추출해야 함
    const batchOperationExtractor = (request) => {
        if (request.method !== 'POST') {
            // throw new ValidationError('Batch requests must use POST method', 'method', request.method);
            return { operation: 'batchError', params: { message: 'Batch requests must use POST method'} };
        }
        const body = request.body || {};
        // 실제 배치 작업은 AllTourismAPI 클래스의 batchRequest 메소드 또는 유사한 로직에서 처리
        // 여기서는 핸들러가 'batch'라는 operation을 받고, params로 operations 배열을 받는다고 가정
        return { operation: 'batch', params: body }; 
    };
    return mainHandler(req, res, batchOperationExtractor);
}


async function metricsHandler(req, res) {
    let container;
    try {
        container = getGlobalContainer();
        const config = container.get('config');
        const cache = container.get('cache');
        const rateLimiter = container.get('rateLimiter');
        const logger = container.get('logger'); // 로거 인스턴스

        if (!config.get('metricsEnabled', true)) {
            res.status(404).json({ success: false, error: { message: 'Metrics not enabled' } });
            return;
        }

        const metricsData = {
            service: {
                name: 'tourism-api',
                version: config.get('version'),
                uptimeMs: Date.now() - SERVICE_START_TIME,
                environment: config.get('environment'),
                nodeVersion: hasProcess ? process.version : 'N/A',
                platform: hasProcess ? process.platform : 'browser/unknown',
            },
            cache: cache.getStats(),
            rateLimiter: rateLimiter.getStats(),
            memory: hasProcess && process.memoryUsage ? {
                rssBytes: process.memoryUsage().rss,
                heapUsedBytes: process.memoryUsage().heapUsed,
                heapTotalBytes: process.memoryUsage().heapTotal,
                externalBytes: process.memoryUsage().external,
                arrayBuffersBytes: process.memoryUsage().arrayBuffers
            } : null,
            // 추가적인 커스텀 메트릭 (예: 로거에서 수집한 에러 카운트 등)
            // customMetrics: logger.getMetrics ? logger.getMetrics() : {} 
        };

        const acceptHeader = req.headers.accept || '';
        if (acceptHeader.includes('text/plain')) {
            const prometheusMetrics = formatPrometheusMetrics(metricsData, config.get('metricsPrefix', 'tourism_api_'));
            res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
            res.status(200).send(prometheusMetrics);
        } else {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.status(200).json({ success: true, data: metricsData });
        }
    } catch (error) {
        const localLogger = container ? container.get('logger') : console;
        localLogger.error('Metrics handler error', { error: error.message, stack: error.stack });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(500).json({ success: false, error: { message: 'Failed to retrieve metrics', details: error.message } });
    }
}


async function healthCheck(req, res) {
    let container;
    let config;
    let i18n;
    let status = 'healthy';
    let statusCode = 200;
    const checks = {};

    try {
        container = getGlobalContainer();
        config = container.get('config');
        i18n = container.get('i18n');

        checks.apiKeyConfigured = config.hasApiKey();
        if (!checks.apiKeyConfigured && hasProcess) { // Node.js 환경에서 API 키 필수
            status = 'unhealthy';
            checks.apiKeyError = i18n.getMessage('MISSING_API_KEY');
        }
        
        checks.serviceContainerInitialized = container.isInitialized();
        if (!checks.serviceContainerInitialized) status = 'unhealthy';

        // (선택적) 외부 API 실제 호출 테스트 (매우 간단하게, 리소스 소모 최소화)
        // try {
        //   const api = container.get('api');
        //   // 가장 가벼운 API 호출 (예: areaCode 파라미터 없이 호출 시 전체 지역 코드 목록)
        //   // 또는 특정 contentId로 detailCommon 호출 (존재하는 ID 사용)
        //   await api.request('areaCode', { numOfRows: 1 }, {}); // req 객체는 null 또는 가짜로 전달
        //   checks.externalApiConnection = 'ok';
        // } catch (apiError) {
        //   status = 'unhealthy';
        //   checks.externalApiConnection = `failed: ${apiError.message}`;
        //   checks.externalApiErrorCode = apiError.code;
        // }

        if (status === 'unhealthy') statusCode = 503; // Service Unavailable

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(statusCode).json({
            status,
            timestamp: new Date().toISOString(),
            uptimeMs: Date.now() - SERVICE_START_TIME,
            version: config.get('version'),
            environment: config.get('environment'),
            checks
        });

    } catch (error) {
        console.error('Health check handler critical error:', { error: error.message, stack: error.stack });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Health check process failed.',
            details: error.message
        });
    }
}


function formatPrometheusMetrics(metrics, prefix = 'tourism_api_') {
    const lines = [];

    const addMetric = (name, value, type = 'gauge', help = '') => {
        if (value === undefined || value === null || isNaN(parseFloat(value))) return; // 유효한 숫자 값만
        const metricName = `${prefix}${name}`;
        if (help) lines.push(`# HELP ${metricName} ${help}`);
        lines.push(`# TYPE ${metricName} ${type}`);
        lines.push(`${metricName} ${value}`);
    };

    addMetric('service_uptime_seconds', Math.floor(metrics.service.uptimeMs / 1000), 'gauge', 'Service uptime in seconds');

    // Cache metrics
    if (metrics.cache) {
        addMetric('cache_hits_total', metrics.cache.hits, 'counter', 'Total cache hits');
        addMetric('cache_misses_total', metrics.cache.misses, 'counter', 'Total cache misses');
        addMetric('cache_sets_total', metrics.cache.sets, 'counter', 'Total cache sets');
        addMetric('cache_deletes_total', metrics.cache.deletes, 'counter', 'Total cache deletes');
        addMetric('cache_clears_total', metrics.cache.clears, 'counter', 'Total cache clears');
        addMetric('cache_expired_total', metrics.cache.expired, 'counter', 'Total cache items expired');
        addMetric('cache_size_items', metrics.cache.size, 'gauge', 'Current number of items in cache');
        addMetric('cache_hit_rate_percent', metrics.cache.hitRate, 'gauge', 'Cache hit rate percentage');
        addMetric('cache_enabled', metrics.cache.enabled ? 1 : 0, 'gauge', 'Cache enabled status (1=true, 0=false)');
    }

    // Rate limiter metrics
    if (metrics.rateLimiter) {
        addMetric('rate_limiter_total_requests_checked_total', metrics.rateLimiter.totalRequests, 'counter', 'Total requests checked by rate limiter');
        addMetric('rate_limiter_limited_requests_total', metrics.rateLimiter.limitedRequests, 'counter', 'Total requests limited by rate limiter');
        addMetric('rate_limiter_active_clients_gauge', metrics.rateLimiter.activeClients, 'gauge', 'Number of active clients tracked by rate limiter');
        addMetric('rate_limiter_enabled', metrics.rateLimiter.enabled ? 1 : 0, 'gauge', 'Rate limiter enabled status (1=true, 0=false)');
    }
    
    // Memory metrics (Node.js only)
    if (metrics.memory) {
        addMetric('memory_rss_bytes', metrics.memory.rssBytes, 'gauge', 'Resident Set Size in bytes');
        addMetric('memory_heap_used_bytes', metrics.memory.heapUsedBytes, 'gauge', 'V8 heap used in bytes');
        addMetric('memory_heap_total_bytes', metrics.memory.heapTotalBytes, 'gauge', 'V8 heap total in bytes');
        addMetric('memory_external_bytes', metrics.memory.externalBytes, 'gauge', 'Memory used by C++ objects bound to JavaScript objects');
        if (metrics.memory.arrayBuffersBytes !== undefined) {
             addMetric('memory_arraybuffers_bytes', metrics.memory.arrayBuffersBytes, 'gauge', 'Memory used by ArrayBuffers and SharedArrayBuffers');
        }
    }
    
    // Custom metrics from logger or other sources could be added here
    // if (metrics.customMetrics) {
    //   Object.entries(metrics.customMetrics).forEach(([key, value]) => {
    //     addMetric(`custom_${key}`, value, 'gauge', `Custom metric ${key}`);
    //   });
    // }

    return lines.join('\n') + '\n';
}


// ===== 모듈 내보내기 (Node.js 환경 전용) =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = handler; // 기본 핸들러
    module.exports.handler = handler;
    module.exports.batch = batchHandler;
    module.exports.metrics = metricsHandler;
    module.exports.healthCheck = healthCheck;

    // 테스트 또는 확장용으로 핵심 클래스들 및 유틸리티 내보내기
    module.exports.AllTourismAPI = AllTourismAPI;
    module.exports.SafeUtils = SafeUtils;
    module.exports.GeoUtils = GeoUtils;
    module.exports.BaseError = BaseError;
    module.exports.TourismApiError = TourismApiError;
    module.exports.ValidationError = ValidationError;
    module.exports.ApiTimeoutError = ApiTimeoutError;
    module.exports.RateLimitError = RateLimitError;
    module.exports.SecurityError = SecurityError;
    module.exports.ResponseFormatter = ResponseFormatter;
    module.exports.ServiceContainer = ServiceContainer;
    module.exports.InternationalizationManager = InternationalizationManager;
    module.exports.ConstantsManager = ConstantsManager;
    module.exports.ConfigManager = ConfigManager;
    module.exports.Logger = Logger;
    module.exports.AdvancedCache = AdvancedCache;
    module.exports.RateLimiter = RateLimiter;
    module.exports.HttpClient = HttpClient;
    module.exports.ApiResponseProcessor = ApiResponseProcessor;
    module.exports.InputValidator = InputValidator;
    module.exports.createServiceContainer = createServiceContainer; // 컨테이너 생성 함수도 내보내기
    module.exports.getGlobalContainer = getGlobalContainer;
} else if (typeof window !== 'undefined') {
    // 브라우저 환경에서는 이 서버리스 API 클라이언트의 핵심 로직을 직접 노출하지 않습니다.
    // API 키 노출 위험 및 서버리스 함수를 통한 접근 강제.
    console.warn('This script is intended for server-side (Node.js) execution.');
}

// ===== 전역 에러 핸들러 (Node.js 환경에서만) =====
if (hasProcess) {
    const globalConsoleLogger = {
        error: (message, data = {}) => { console.error(`[GLOBAL_ERROR] ${new Date().toISOString()} ${message}`, SafeUtils.maskSensitiveData(data)); },
        warn: (message, data = {}) => { console.warn(`[GLOBAL_WARN] ${new Date().toISOString()} ${message}`, SafeUtils.maskSensitiveData(data)); }
    };

    process.on('uncaughtException', (error) => {
        globalConsoleLogger.error('Uncaught Exception:', { name: error.name, message: error.message, stack: error.stack });
        // 프로덕션에서는 로깅 후 process.exit(1) 또는 그레이스풀 셧다운 고려.
        // 서버리스 환경에서는 런타임이 인스턴스를 종료할 수 있음.
    });

    process.on('unhandledRejection', (reason, promise) => {
        let errorDetails = {};
        if (reason instanceof Error) {
            errorDetails = { name: reason.name, message: reason.message, stack: reason.stack };
        } else {
            errorDetails = { reason: String(reason) };
        }
        globalConsoleLogger.error('Unhandled Rejection at:', { promise, ...errorDetails });
    });
}

// ===== API 버전 정보 =====
const API_VERSION = '2.1.3'; // ConfigManager와 일치
const API_BUILD_DATE = new Date().toISOString();

if (typeof module !== 'undefined' && module.exports) {
    module.exports.VERSION = API_VERSION;
    module.exports.BUILD_DATE = API_BUILD_DATE;
}

console.log(`🚀 All Tourism API v${API_VERSION} (Build: ${API_BUILD_DATE}) loaded. Ready for requests.`);
