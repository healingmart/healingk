관광 정보 API 서버리스 함수 (오류 수정 및 개선 버전)

## 주요 변경 사항:

- API 키 처리 개선: API 키 누락 시 명확한 오류 메시지 반환
- HTTP 클라이언트 안정성 향상: Node.js 환경에서 http/https 모듈 동적 import 개선
- 에러 핸들링 강화: 전반적인 에러 처리 로직 개선
- 코드 가독성 향상: 주석 추가 및 코드 구조 정리
- 한국관광공사 API 엔드포인트 수정 (operation 뒤의 '1' 제거)
- 응답 데이터 처리 및 유효성 검사 강화
- `ServiceKey` URL 인코딩 로직 개선
- `homepage` 필드 처리 로직 개선 (URL 유효성 검사)
- `SafeUtils.isValidUrl` 정규식 오타 수정
- HTTP API 기본 URL을 HTTPS로 변경
- 전역 에러 핸들러 로깅 방식 간소화
- `req.body` 파싱 로직 간소화 (서버리스 환경 최적화)
- **개선: 배치 요청 최대 크기 ConfigManager로 이동**
- **개선: SafeUtils.sanitizeInput에 HTML 보안 라이브러리 사용 권고 주석 강화**
- **보안: 브라우저 환경에서 전역 변수 노출 제거 (API 키 노출 위험 방지)**
- **구조: 파일 분리 필요성에 대한 주석 추가**

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
     * **주의: 복잡한 HTML 콘텐츠의 XSS 방지를 위해서는 DOMPurify 또는 sanitize-html과 같은
     * 전문 라이브러리 사용을 강력히 권장합니다. 현재 구현은 기본적인 수준의 방어입니다.**
     * @param {string} input - 위생 처리할 문자열
     * @param {number} maxLength - 최대 길이
     * @param {object} options - 추가 옵션
     * @param {string[]} [options.allowedTags] - 허용할 HTML 태그 (기본: 태그 제거)
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
            // 주의: 이 방식은 완벽한 HTML 파싱이 아니므로, 복잡한 HTML에서는 DOMPurify 같은 라이브러리 사용 권장.
            // 허용된 태그 목록을 동적으로 구성
            const allowedTagsPattern = options.allowedTags.map(tag => `(?:${tag})`).join('|');
            const tagRegex = new RegExp(`<(?!\/?(?:${allowedTagsPattern})\\b)[^>]*?>`, 'gi');
            sanitized = sanitized.replace(tagRegex, '');
        } else {
            // 기본적으로 모든 HTML 태그 제거
            sanitized = sanitized.replace(/<[^>]*>/g, '');
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
            // http 또는 https 프로토콜로 시작하는지 확인
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

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
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
            // radius가 유효하지 않거나 0 이하면 필터링 안 함
            if (isNaN(rad) || rad <= 0) return true;
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
        // 국제화 메시지 처리
        if (this.i18n && this.i18n.getMessage) {
            this.localizedMessage = this.i18n.getMessage(code, details) || message;
        } else {
            this.localizedMessage = message;
        }
        // 스택 트레이스 캡처
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        } else {
            this.stack = new Error(message).stack;
        }
    }

    /**
     * 에러 객체를 JSON 형식으로 직렬화합니다.
     * @returns {object} JSON 형식의 에러 객체
     */
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

/**
 * 관광 API 관련 특정 에러 클래스입니다.
 */
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

/**
 * 입력값 유효성 검사 에러 클래스입니다.
 */
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

/**
 * API 요청 시간 초과 에러 클래스입니다.
 */
class ApiTimeoutError extends BaseError {
    constructor(timeout, operation = 'unknown', i18n = null) {
        const message = i18n ? i18n.getMessage('API_TIMEOUT', { timeout, operation }) : `API request timed out after ${timeout}ms for operation '${operation}'.`;
        super(message, 'API_TIMEOUT', 504, { timeout, operation }, i18n);
        this.timeout = timeout;
        this.operation = operation;
    }
}

/**
 * API 요청 한도 초과 에러 클래스입니다.
 */
class RateLimitError extends BaseError {
    constructor(limit, remaining, i18n = null) {
        const message = i18n ? i18n.getMessage('RATE_LIMIT_EXCEEDED', { limit, remaining }) : `Rate limit exceeded. Limit: ${limit}, Remaining: ${remaining}.`;
        super(message, 'RATE_LIMIT_EXCEEDED', 429, { limit, remaining }, i18n);
        this.limit = limit;
        this.remaining = remaining;
    }
}

/**
 * 보안 관련 에러 클래스입니다.
 */
class SecurityError extends BaseError {
    constructor(message = 'Security threat detected', code = 'SECURITY_ERROR', details = {}, i18n = null) {
        const localizedMessage = i18n ? i18n.getMessage(code, details) : message;
        super(localizedMessage, code, 403, details, i18n);
    }
}

// ===== 응답 포맷터 =====
/**
 * API 응답을 일관된 형식으로 포맷팅하는 클래스입니다.
 */
class ResponseFormatter {
    /**
     * 성공 응답을 포맷합니다.
     * @param {string} operation - 수행된 작업명
     * @param {object} data - 응답 데이터
     * @param {object} metadata - 추가 메타데이터
     * @param {object} performance - 성능 정보
     * @returns {object} 포맷된 성공 응답
     */
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

    /**
     * 에러 응답을 포맷합니다.
     * @param {Error|BaseError} error - 에러 객체
     * @param {string} operation - 에러가 발생한 작업명
     * @returns {object} 포맷된 에러 응답
     */
    static formatError(error, operation = 'unknown') {
        if (error instanceof BaseError) {
            const errorJson = error.toJSON();
            if (operation && !errorJson.error.operation) {
                errorJson.error.operation = operation;
            }
            return errorJson;
        }

        // 알 수 없는 에러에 대한 처리 (i18n 사용)
        const i18n = error.i18n; // 에러 객체에 i18n이 직접 포함되어 있다면 사용
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

    /**
     * 응답 데이터에 캐시 정보를 추가합니다.
     * @param {object} data - 원본 응답 데이터
     * @param {boolean} isCached - 캐시 사용 여부
     * @param {object} cacheStats - 캐시 통계 정보
     * @returns {object} 캐시 정보가 추가된 응답 데이터
     */
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
/**
 * 의존성 주입을 관리하는 서비스 컨테이너입니다.
 */
class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.instances = new Map();
        this.initialized = false;
    }

    /**
     * 서비스를 컨테이너에 등록합니다.
     * @param {string} name - 서비스 이름
     * @param {function(ServiceContainer): object} factory - 서비스 인스턴스를 생성하는 팩토리 함수
     * @returns {ServiceContainer} 현재 컨테이너 인스턴스 (체이닝용)
     */
    register(name, factory) {
        if (this.services.has(name)) {
            console.warn(`Service ${name} is already registered. Overwriting.`);
        }
        this.services.set(name, factory);
        return this;
    }

    /**
     * 서비스 인스턴스를 가져옵니다. (싱글턴 패턴)
     * @param {string} name - 가져올 서비스 이름
     * @returns {object} 서비스 인스턴스
     * @throws {Error} 서비스가 등록되지 않은 경우
     */
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

    /**
     * 등록된 모든 서비스를 초기화(인스턴스화)합니다.
     */
    initialize() {
        if (this.initialized) return;
        for (const name of this.services.keys()) {
            this.get(name); // 모든 서비스 인스턴스화
        }
        this.initialized = true;
        console.log('Service container initialized with services:', Array.from(this.instances.keys()).join(', '));
    }

    /**
     * 컨테이너가 초기화되었는지 여부를 반환합니다.
     * @returns {boolean} 초기화 여부
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * 현재 인스턴스화된 서비스들의 목록을 반환합니다.
     * @returns {string[]} 인스턴스화된 서비스 이름 목록
     */
    getInstancedServices() {
        return Array.from(this.instances.keys());
    }

    /**
     * 컨테이너와 모든 서비스 인스턴스를 파괴합니다.
     * (주로 테스트 환경이나 애플리케이션 종료 시 사용)
     */
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
/**
 * 다국어 메시지를 관리하는 클래스입니다.
 */
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
                ENUM_ERROR: "허용된 값 중 하나여야 합니다: ${values}",
                API_RESPONSE_ERROR: "API 응답에 오류가 발생했습니다. 상태: ${status} ${statusText}",
                API_LOGIC_ERROR: "API 내부 처리 오류가 발생했습니다. 코드: ${resultCode}",
                NETWORK_ERROR: "네트워크 오류가 발생하여 API 요청을 처리할 수 없습니다.",
                APPLICATION_ERROR: "어플리케이션 에러가 발생했습니다.",
                DB_ERROR: "데이터베이스 에러가 발생했습니다.",
                NODATA_ERROR: "데이터가 없습니다.",
                HTTP_ERROR: "HTTP 에러가 발생했습니다.",
                SERVICETIMEOUT_ERROR: "서비스 연결 시간이 초과되었습니다.",
                INVALID_REQUEST_PARAMETER_ERROR: "잘못된 요청 파라미터입니다.",
                NO_MANDATORY_REQUEST_PARAMETERS_ERROR: "필수 요청 파라미터가 누락되었습니다.",
                END_OF_SERVICE_ERROR: "해당 오픈 API 서비스가 없거나 폐기되었습니다.",
                SERVICE_ACCESS_DENIED_ERROR: "서비스 접근이 거부되었습니다.",
                TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR: "일시적으로 사용할 수 없는 서비스 키입니다.",
                LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR: "서비스 요청 제한 횟수를 초과했습니다.",
                SERVICE_KEY_IS_NOT_REGISTERED_ERROR: "등록되지 않은 서비스 키입니다.",
                DEADLINE_HAS_EXPIRED_ERROR: "서비스 키 사용 기간이 만료되었습니다.",
                UNREGISTERED_IP_ERROR: "등록되지 않은 IP."
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
                ENUM_ERROR: "Must be one of the allowed values: ${values}",
                API_RESPONSE_ERROR: "API response error. Status: ${status} ${statusText}",
                API_LOGIC_ERROR: "API internal processing error. Code: ${resultCode}",
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

    /**
     * 현재 언어를 설정합니다. 지원하지 않는 언어일 경우 경고를 출력하고 기본 언어를 유지합니다.
     * @param {string} language - 설정할 언어 코드 (예: 'ko', 'en')
     */
    setLanguage(language) {
        if (this.messages[language]) {
            this.currentLanguage = language;
        } else {
            console.warn(`Language '${language}' not supported. Using '${this.currentLanguage}'.`);
        }
    }

    /**
     * 현재 설정된 언어를 반환합니다.
     * @returns {string} 현재 언어 코드
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * 지정된 키에 해당하는 메시지를 가져오고, 플레이스홀더를 대체합니다.
     * @param {string} key - 메시지 키
     * @param {object} params - 플레이스홀더 대체에 사용할 파라미터 객체
     * @returns {string} 포맷된 메시지
     */
    getMessage(key, params = {}) {
        const langMessages = this.messages[this.currentLanguage] || this.messages.ko;
        let message = langMessages[key] || key; // 메시지가 없으면 키 자체를 반환
        for (const paramKey in params) {
            message = message.replace(new RegExp(`\\$\\{${paramKey}\\}`, 'g'), params[paramKey]);
        }
        return message;
    }

    /**
     * 인스턴스를 파괴하고 리소스를 정리합니다.
     */
    destroy() {
        // console.log('InternationalizationManager destroyed'); // 주석 처리: 로거가 파괴될 때 불필요한 로그 방지
    }
}

// ===== 상수 관리자 =====
/**
 * 애플리케이션 전반에 걸쳐 사용되는 상수들을 관리합니다.
 */
class ConstantsManager {
    constructor() {
        // 한국관광공사 API의 content type ID 목록 및 다국어 이름
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
        // 한국관광공사 API의 지역 코드 목록 및 다국어 이름
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
        // 지원하는 API 오퍼레이션 목록
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
        // 캐시 설정
        this.CACHE_SETTINGS = {
            defaultTTL: 60 * 60 * 1000, // 1시간
            shortTTL: 5 * 60 * 1000,    // 5분
            longTTL: 24 * 60 * 60 * 1000 // 24시간
        };
        // 외부 API 호출 설정
        this.API_SETTINGS = {
            baseUrl: 'https://apis.data.go.kr/B551011/KorService', // 한국관광공사 API 기본 URL (HTTPS로 변경)
            // 모든 API 호출에 기본으로 포함될 파라미터
            defaultParams: {
                MobileOS: 'ETC', // 모바일 OS 구분 (ETC: 기타, AND: 안드로이드, IOS: iOS)
                MobileApp: 'TourismAPI', // 서비스명
                _type: 'json' // 응답 포맷 (json 또는 xml)
            }
        };
    }

    /**
     * Content Type ID에 해당하는 이름을 반환합니다.
     * @param {string} contentTypeId - Content Type ID
     * @param {string} language - 언어 코드
     * @returns {string} Content Type 이름
     */
    getContentTypeName(contentTypeId, language = 'ko') {
        return this.CONTENT_TYPES[contentTypeId]?.[language] || contentTypeId;
    }

    /**
     * 지역 코드에 해당하는 이름을 반환합니다.
     * @param {string} areaCode - 지역 코드
     * @param {string} language - 언어 코드
     * @returns {string} 지역 이름
     */
    getAreaName(areaCode, language = 'ko') {
        return this.AREA_CODES[areaCode]?.[language] || areaCode;
    }

    /**
     * 주어진 오퍼레이션이 유효한지 확인합니다.
     * @param {string} operation - 확인할 오퍼레이션 이름
     * @returns {boolean} 유효성 여부
     */
    isValidOperation(operation) {
        return this.OPERATIONS.includes(operation);
    }

    /**
     * 인스턴스를 파괴하고 리소스를 정리합니다.
     */
    destroy() {
        // console.log('ConstantsManager destroyed'); // 주석 처리: 로거가 파괴될 때 불필요한 로그 방지
    }
}

// ===== 설정 관리자 =====
/**
 * 애플리케이션의 설정을 관리합니다.
 */
class ConfigManager {
    constructor(container) {
        this.container = container;
        this.config = {
            version: '2.1.2', // 버전 업데이트
            environment: hasProcess ? process.env.NODE_ENV || 'development' : 'browser', // Node.js 환경에서만 process.env 사용
            apiKey: hasProcess ? process.env.TOURISM_API_KEY : null, // Node.js 환경에서만 환경 변수에서 API 키 가져옴
            apiBaseUrl: 'https://apis.data.go.kr/B551011/KorService', // 기본 API URL (HTTPS로 변경)
            defaultLanguage: 'ko',
            cacheEnabled: true,
            cacheTTL: 60 * 60 * 1000, // 1시간
            rateLimitEnabled: true,
            rateLimit: 100, // 분당 요청 수
            rateLimitWindow: 60 * 1000, // 1분
            enableBatching: true, // 배치 요청 활성화 여부
            batchMaxOperations: 20, // 배치 요청 시 한 번에 처리할 최대 작업 수 (새로운 설정)
            logLevel: 'info', // 'debug', 'info', 'warn', 'error'
            logFormat: 'json', // 'json' 또는 'text'
            logToConsole: true,
            logToFile: false, // 파일 로깅 활성화 여부 (Node.js 전용)
            logFilePath: './logs/tourism-api.log',
            metricsEnabled: true, // 메트릭 수집 활성화 여부
            metricsInterval: 60 * 1000, // 1분
            allowedOrigins: '*' // CORS 허용 Origin
        };
    }

    /**
     * 특정 설정 값을 가져옵니다.
     * @param {string} key - 설정 키
     * @returns {*} 설정 값
     */
    get(key) {
        return this.config[key];
    }

    /**
     * 특정 설정 값을 설정합니다.
     * @param {string} key - 설정 키
     * @param {*} value - 설정할 값
     * @returns {ConfigManager} 현재 인스턴스 (체이닝용)
     */
    set(key, value) {
        this.config[key] = value;
        return this;
    }

    /**
     * 모든 설정 값을 복사하여 반환합니다.
     * @returns {object} 모든 설정 값
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * 민감한 정보를 제외한 공개 가능한 설정 값을 반환합니다.
     * @returns {object} 공개 가능한 설정 값
     */
    getPublicConfig() {
        const { apiKey, ...publicConfig } = this.config;
        return publicConfig;
    }

    /**
     * 설정 값의 유효성을 검사합니다.
     * @returns {boolean} 설정 유효성 여부
     */
    validateConfig() {
        const logger = this.container.get('logger');
        const i18n = this.container.get('i18n');
        let isValid = true;
        if (!this.get('apiKey') && hasProcess) {
            // Node.js 환경에서만 API 키 누락 경고
            logger.warn(i18n.getMessage('MISSING_API_KEY'));
        }
        if (!['debug', 'info', 'warn', 'error'].includes(this.get('logLevel'))) {
            logger.warn(`Invalid logLevel: ${this.get('logLevel')}. Defaulting to 'info'.`);
            this.set('logLevel', 'info');
        }
        return isValid;
    }

    /**
     * 인스턴스를 파괴하고 리소스를 정리합니다.
     */
    destroy() {
        // console.log('ConfigManager destroyed'); // 주석 처리: 로거가 파괴될 때 불필요한 로그 방지
    }
}

// ===== 로거 =====
/**
 * 로그를 기록하고 관리하는 클래스입니다.
 */
class Logger {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
        this.currentLevel = this.levels[this.config.get('logLevel')] || this.levels.info;
        this.metrics = {};
    }

    /**
     * 로그를 기록합니다.
     * @param {string} level - 로그 레벨
     * @param {string} message - 로그 메시지
     * @param {object} data - 추가 데이터
     * @private
     */
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
                // 브라우저 console은 객체를 바로 출력하므로 JSON.stringify 대신 객체 전달
                console[level](logEntry);
            } else {
                console[level](`[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}`, data);
            }
        }
        if (this.config.get('logToFile') && hasProcess) {
            // Node.js 환경에서만 파일 로깅 구현 (예: fs.appendFile)
            // 이 부분은 실제 파일 시스템 접근 로직이 필요하며, 서버리스 환경에서는 제한될 수 있습니다.
        }
        this._updateMetrics(level, data);
    }

    /**
     * 메트릭을 업데이트합니다.
     * @param {string} level - 로그 레벨
     * @param {object} data - 로그 데이터
     * @private
     */
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

    /**
     * 디버그 로그를 기록합니다.
     * @param {string} message - 메시지
     * @param {object} data - 데이터
     */
    debug(message, data = {}) { this._log('debug', message, data); }

    /**
     * 정보 로그를 기록합니다.
     * @param {string} message - 메시지
     * @param {object} data - 데이터
     */
    info(message, data = {}) { this._log('info', message, data); }

    /**
     * 경고 로그를 기록합니다.
     * @param {string} message - 메시지
     * @param {object} data - 데이터
     */
    warn(message, data = {}) { this._log('warn', message, data); }

    /**
     * 에러 로그를 기록합니다.
     * @param {string} message - 메시지
     * @param {object} data - 데이터
     */
    error(message, data = {}) { this._log('error', message, data); }

    /**
     * 현재 수집된 메트릭을 반환합니다.
     * @returns {object} 메트릭 데이터
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * 시스템 메모리 정보를 반환합니다 (Node.js 환경에서만).
     * @returns {object} 메모리 정보
     */
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

    /**
     * 인스턴스를 파괴하고 리소스를 정리합니다.
     */
    destroy() {
        // console.log('Logger destroyed'); // 주석 처리: 로거가 파괴될 때 불필요한 로그 방지
    }
}

// ===== 고급 캐시 =====
/**
 * 고급 캐싱 기능을 제공하는 클래스입니다.
 */
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

    /**
     * 캐시 키를 생성합니다. 파라미터를 정렬하여 일관된 키를 생성합니다.
     * @param {string} operation - API 오퍼레이션 이름
     * @param {object} params - 요청 파라미터
     * @returns {string} 생성된 캐시 키
     */
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
            // 오류 발생 시 랜덤 키 반환하여 캐시 사용 방지
            return `${operation}:${Date.now()}:${Math.random()}`;
        }
    }

    /**
     * 캐시에서 값을 가져옵니다.
     * @param {string} key - 캐시 키
     * @returns {*} 캐시된 값 또는 null
     */
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

    /**
     * 캐시에 값을 설정합니다.
     * @param {string} key - 캐시 키
     * @param {*} value - 캐시할 값
     * @param {number} ttl - 캐시 유지 시간 (밀리초). 기본값은 ConfigManager에서 가져옵니다.
     */
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

    /**
     * 캐시에서 특정 키의 항목을 삭제합니다.
     * @param {string} key - 삭제할 캐시 키
     * @returns {boolean} 삭제 성공 여부
     */
    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.stats.deletes++;
            this.stats.size = this.cache.size;
        }
        return deleted;
    }

    /**
     * 캐시를 완전히 비웁니다.
     */
    clear() {
        this.cache.clear();
        this.stats.size = 0;
        this.stats.deletes++;
        this.logger.info('캐시가 초기화되었습니다');
    }

    /**
     * 현재 캐시 통계를 반환합니다.
     * @returns {object} 캐시 통계
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * 가장 많이 접근된 캐시 항목 목록을 반환합니다.
     * @param {number} limit - 반환할 항목의 최대 개수
     * @returns {Array<object>} 상위 캐시 항목 목록
     */
    getTopItems(limit = 10) {
        const items = Array.from(this.cache.entries())
            .map(([key, item]) => ({
                key,
                accessCount: item.accessCount,
                lastAccessed: item.lastAccessed,
                expires: item.expires,
                ttl: item.expires - Date.now() // 남은 TTL 계산
            }))
            .sort((a, b) => b.accessCount - a.accessCount) // 접근 횟수 기준으로 내림차순 정렬
            .slice(0, limit);
        return items;
    }

    /**
     * 캐시 적중률을 업데이트합니다.
     * @private
     */
    _updateHitRate() {
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    }

    /**
     * 만료된 캐시 항목을 정리합니다.
     * @private
     */
    _cleanup() {
        const now = Date.now();
        if (now - this.lastCleanup < this.cleanupInterval) return; // 설정된 정리 주기 내에 있으면 스킵
        this.lastCleanup = now;
        let expiredCount = 0;
        for (const [key, item] of this.cache.entries()) {
            if (item.expires < now) {
                this.cache.delete(key);
                expiredCount++;
            }
        }
        this.stats.size = this.cache.size;
        if (expiredCount > 0) {
            this.logger.debug('캐시 정리 완료', { expiredCount, remainingSize: this.cache.size });
        }
    }

    /**
     * 인스턴스를 파괴하고 캐시를 비웁니다.
     */
    destroy() {
        this.cache.clear();
        // console.log('캐시가 정리되었습니다'); // 주석 처리: 로거가 파괴될 때 불필요한 로그 방지
    }
}

// ===== 속도 제한 관리자 =====
/**
 * API 요청에 대한 속도 제한을 관리하는 클래스입니다.
 */
class RateLimiter {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.logger = container.get('logger');
        this.requests = new Map(); // 요청 ID와 타임스탬프 저장
        this.limit = this.config.get('rateLimit') || 100; // 기본값: 100회
        this.window = this.config.get('rateLimitWindow') || 60 * 1000; // 기본값: 1분 (60초)
        this.enabled = this.config.get('rateLimitEnabled') !== false; // 설정에 따라 활성화/비활성화
        this.stats = {
            totalRequests: 0, // 전체 요청 수
            limitedRequests: 0, // 속도 제한으로 거부된 요청 수
            currentWindowRequests: 0 // 현재 윈도우 내의 요청 수
        };
    }

    /**
     * 요청이 허용되는지 확인합니다.
     * @param {string} requestId - 요청 ID
     * @returns {boolean} 요청 허용 여부
     */
    isAllowed(requestId) {
        if (!this.enabled) return true; // 속도 제한 기능이 비활성화된 경우 항상 허용
        const now = Date.now();
        this._cleanup(now); // 만료된 요청 정리
        this.stats.totalRequests++;
        this.stats.currentWindowRequests = this.requests.size; // 현재 윈도우 내 요청 수 업데이트
        const currentCount = this._getCurrentCount(now);
        if (currentCount >= this.limit) {
            this.stats.limitedRequests++; // 거부된 요청 수 증가
            this.logger.warn('속도 제한 초과', {
                requestId,
                currentCount,
                limit: this.limit
            });
            return false; // 속도 제한 초과, 요청 거부
        }
        this._addRequest(requestId, now); // 요청 추가
        return true; // 요청 허용
    }

    /**
     * 남은 요청 할당량을 반환합니다.
     * @param {string} requestId - 요청 ID
     * @returns {number} 남은 요청 할당량
     */
    getRemainingQuota(requestId) {
        if (!this.enabled) return this.limit;
        const now = Date.now();
        this._cleanup(now);
        const currentCount = this._getCurrentCount(now);
        return Math.max(0, this.limit - currentCount);
    }

    /**
     * 현재 속도 제한 통계를 반환합니다.
     * @returns {object} 속도 제한 통계
     */
    getStats() {
        return {
            ...this.stats,
            enabled: this.enabled,
            limit: this.limit,
            window: this.window,
            remaining: this.limit - this.stats.currentWindowRequests // 남은 할당량
        };
    }

    /**
     * 현재 윈도우 내의 요청 수를 반환합니다.
     * @param {number} now - 현재 타임스탬프
     * @returns {number} 현재 요청 수
     * @private
     */
    _getCurrentCount(now) {
        this._cleanup(now);
        return this.requests.size;
    }

    /**
     * 새 요청을 기록합니다.
     * @param {string} requestId - 요청 ID
     * @param {number} now - 현재 타임스탬프
     * @private
     */
    _addRequest(requestId, now) {
        this.requests.set(requestId, {
            timestamp: now,
            requestId
        });
    }

    /**
     * 속도 제한 윈도우를 벗어난 오래된 요청을 정리합니다.
     * @param {number} now - 현재 타임스탬프
     * @private
     */
    _cleanup(now) {
        const cutoff = now - this.window;
        for (const [id, request] of this.requests.entries()) {
            if (request.timestamp < cutoff) {
                this.requests.delete(id);
            }
        }
        this.stats.currentWindowRequests = this.requests.size;
    }

    /**
     * 인스턴스를 파괴하고 리소스를 정리합니다.
     */
    destroy() {
        this.requests.clear();
        // this.logger.info('속도 제한 관리자가 정리되었습니다'); // 주석 처리: 로거가 파괴될 때 불필요한 로그 방지
    }
}

// ===== HTTP 클라이언트 =====
/**
 * 외부 API에 HTTP 요청을 보내는 클라이언트입니다.
 */
class HttpClient {
    constructor(container) {
        this.container = container;
        this.config = container.get('config');
        this.logger = container.get('logger');
        this.constants = container.get('constants');
        this.i18n = container.get('i18n');
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalResponseTime: 0,
            averageResponseTime: 0
        };
    }

    /**
     * 한국관광공사 API에 데이터를 요청합니다.
     * @param {string} operation - 호출할 API 오퍼레이션 (예: 'areaBasedList')
     * @param {object} params - 요청 파라미터
     * @param {object} options - 추가 옵션 (예: requestId)
     * @returns {Promise<object>} API 응답 데이터
     * @throws {TourismApiError} API 관련 오류 발생 시
     */
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
        const url = new URL(`${baseUrl}/${operation}`); // 한국관광공사 API는 operation 뒤에 '1'이 붙지 않음
        const defaultParams = {
            // ServiceKey는 환경 변수에서 가져온 값을 URL 인코딩 전에 디코딩하여 사용
            ServiceKey: decodeURIComponent(apiKey),
            ...this.constants.API_SETTINGS.defaultParams // 기본 파라미터 추가
        };

        // 파라미터를 URLSearchParams에 추가
        Object.entries({ ...defaultParams, ...params }).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.append(key, String(value));
            }
        });

        this.logger.debug('API 요청 시작', {
            requestId,
            operation,
            url: url.toString().replace(apiKey, '***MASKED***') // 로그에 API 키 마스킹
        });

        this.stats.totalRequests++;

        try {
            let response;
            // Node.js 환경에서 fetch가 기본 제공되지 않을 때 'node-fetch' 사용
            // Node.js 18+에서는 fetch가 내장되어 있으므로 이 조건문이 불필요해질 수 있음
            if (hasProcess && typeof fetch === 'undefined') {
                const { default: nodeFetch } = await import('node-fetch');
                response = await nodeFetch(url.toString());
            } else {
                // 브라우저 또는 최신 Node.js 환경
                response = await fetch(url.toString());
            }

            if (!response.ok) {
                let errorBody = null;
                try {
                    errorBody = await response.json(); // 에러 응답 본문 파싱 시도
                } catch (e) {
                    this.logger.warn('API 응답 에러 본문 파싱 실패', { requestId, operation, error: e.message });
                }
                this.logger.error('API 응답 오류', {
                    requestId, operation, status: response.status, statusText: response.statusText, body: errorBody
                });
                throw new TourismApiError(
                    'API_RESPONSE_ERROR',
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

            // 한국관광공사 API의 고유한 결과 코드 처리
            if (resultCode !== '0000') {
                this.logger.warn('API 결과 코드 오류', {
                    requestId, operation, resultCode, resultMsg
                });
                let customErrorCode = 'API_LOGIC_ERROR';
                let statusCode = 500;
                switch (resultCode) {
                    case '0001': customErrorCode = 'APPLICATION_ERROR'; break; // 어플리케이션 에러
                    case '0002': customErrorCode = 'DB_ERROR'; break; // 데이터베이스 에러
                    case '0003': customErrorCode = 'NODATA_ERROR'; break; // 데이터 없음 (200 OK지만 데이터가 없는 경우)
                    case '0004': customErrorCode = 'HTTP_ERROR'; break; // HTTP 에러
                    case '0005': customErrorCode = 'SERVICETIMEOUT_ERROR'; break; // 서비스 연결 실패
                    case '0010': customErrorCode = 'INVALID_REQUEST_PARAMETER_ERROR'; statusCode = 400; break; // 잘못된 요청 파라메터
                    case '0011': customErrorCode = 'NO_MANDATORY_REQUEST_PARAMETERS_ERROR'; statusCode = 400; break; // 필수 요청 파라메터 없음
                    case '0012': customErrorCode = 'END_OF_SERVICE_ERROR'; break; // 해당 오픈 API 서비스가 없거나 폐기됨
                    case '0020': customErrorCode = 'SERVICE_ACCESS_DENIED_ERROR'; statusCode = 403; break; // 서비스 접근 거부
                    case '0021': customErrorCode = 'TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR'; statusCode = 403; break; // 일시적으로 사용할 수 없는 서비스 키
                    case '0022': customErrorCode = 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR'; statusCode = 429; break; // 서비스 요청제한횟수 초과
                    case '0030': customErrorCode = 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR'; statusCode = 401; break; // 등록되지 않은 서비스키
                    case '0031': customErrorCode = 'DEADLINE_HAS_EXPIRED_ERROR'; statusCode = 403; break; // 서비스 키 사용기간 만료
                    case '0032': customErrorCode = 'UNREGISTERED_IP_ERROR'; statusCode = 403; break; // 등록되지 않은 IP
                    case '9999': customErrorCode = 'UNKNOWN_ERROR'; break; // 기타 에러
                }
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
                stack: error.stack,
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

    /**
     * HTTP 클라이언트의 통계를 반환합니다.
     * @returns {object} 통계 데이터
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * 인스턴스를 파괴하고 리소스를 정리합니다.
     */
    destroy() {
        // this.logger.info('HTTP 클라이언트가 정리되었습니다'); // 주석 처리: 로거가 파괴될 때 불필요한 로그 방지
    }
}

// ===== API 응답 처리기 =====
/**
 * 한국관광공사 API 응답 데이터를 추출하고 가공하는 클래스입니다.
 */
class ApiResponseProcessor {
    /**
     * API 응답에서 아이템 목록을 추출합니다.
     * @param {object} data - API 응답 원본 데이터
     * @returns {Array<object>} 추출된 아이템 목록
     */
    static extractItems(data) {
        try {
            const items = data.response?.body?.items?.item;
            if (!items) return [];
            return Array.isArray(items) ? items : [items]; // 단일 항목일 경우 배열로 변환
        } catch (error) {
            console.warn('Error extracting items from API response:', error);
            return []; // 에러 발생 시에도 빈 배열 반환 (방어적 코딩)
        }
    }

    /**
     * 기본 관광지 아이템 데이터를 처리하고 정규화합니다.
     * @param {object} item - 원본 아이템 객체
     * @param {ServiceContainer} container - 서비스 컨테이너
     * @returns {object|null} 처리된 아이템 객체 또는 null
     */
    static processBasicItem(item, container) {
        try {
            if (!item) return null;
            const constants = container.get('constants');
            const i18n = container.get('i18n');
            const lang = i18n.getCurrentLanguage();
            return {
                contentid: item.contentid,
                contenttypeid: item.contenttypeid,
                title: SafeUtils.sanitizeInput(item.title),
                addr1: SafeUtils.sanitizeInput(item.addr1),
                addr2: SafeUtils.sanitizeInput(item.addr2),
                zipcode: item.zipcode,
                tel: SafeUtils.sanitizeInput(item.tel),
                firstimage: this.validateImageUrl(item.firstimage),
                firstimage2: this.validateImageUrl(item.firstimage2),
                mapx: this.sanitizeCoordinate(item.mapx), // 경도
                mapy: this.sanitizeCoordinate(item.mapy), // 위도
                areacode: item.areacode,
                sigungucode: item.sigungucode,
                cat1: item.cat1,
                cat2: item.cat2,
                cat3: item.cat3,
                // overview 필드에 HTML 태그 허용하도록 SafeUtils.sanitizeInput 옵션 추가
                overview: SafeUtils.sanitizeInput(item.overview, 4000, {
                    allowedTags: ['p', 'br', 'a', 'strong', 'em', 'ul', 'ol', 'li', 'b', 'i', 'u', 's', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td']
                }),
                // homepage 필드는 URL 문자열이므로, URL 유효성 검사만 수행
                homepage: SafeUtils.isValidUrl(item.homepage) ? item.homepage : null,
                createdtime: this.formatDate(item.createdtime),
                modifiedtime: this.formatDate(item.modifiedtime),
                meta: {
                    contentTypeName: constants.getContentTypeName(item.contenttypeid, lang),
                    areaName: constants.getAreaName(item.areacode, lang),
                    hasImage: !!(item.firstimage || item.firstimage2),
                    hasCoordinates: !!(item.mapx && item.mapy && GeoUtils.isValidCoordinate(item.mapy, item.mapx)),
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

    /**
     * 이미지 URL의 유효성을 검증합니다.
     * @param {string} url - 이미지 URL
     * @returns {string|null} 유효한 URL 또는 null
     */
    static validateImageUrl(url) {
        if (!url || typeof url !== 'string') return null;
        // SafeUtils.isValidUrl은 이미 http/https 프로토콜을 확인하므로 재확인 불필요
        if (!SafeUtils.isValidUrl(url)) return null;

        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        const hasValidExtension = imageExtensions.some(ext => url.toLowerCase().endsWith(ext));
        return hasValidExtension ? url : null;
    }

    /**
     * 좌표 문자열을 숫자로 변환하고 유효성을 검증합니다.
     * @param {string} coord - 좌표 문자열
     * @returns {number|null} 유효한 숫자 좌표 또는 null
     */
    static sanitizeCoordinate(coord) {
        if (!coord) return null;
        const num = SafeUtils.safeParseFloat(coord);
        if (isNaN(num)) return null;
        // 위도/경도 범위는 GeoUtils.isValidCoordinate에서 더 자세히 검증
        // 여기서는 숫자 변환만
        return num;
    }

    /**
     * 날짜 문자열을 ISO 8601 형식으로 변환합니다.
     * 한국관광공사 API는 YYYYMMDDHHMMSS 또는 YYYYMMDD 형식을 반환합니다.
     * @param {string} dateString - 날짜 문자열
     * @returns {string|null} ISO 8601 형식의 날짜 문자열 또는 null
     */
    static formatDate(dateString) {
        if (!dateString) return null;
        try {
            if (/^\d{14}$/.test(dateString)) { // YYYYMMDDHHMMSS
                const y = parseInt(dateString.substring(0, 4));
                const m = parseInt(dateString.substring(4, 6));
                const d = parseInt(dateString.substring(6, 8));
                const h = parseInt(dateString.substring(8, 10));
                const min = parseInt(dateString.substring(10, 12));
                const s = parseInt(dateString.substring(12, 14));
                if (!this.isValidDateTime(y, m, d, h, min, s)) return null;
                return new Date(y, m - 1, d, h, min, s).toISOString();
            }
            if (/^\d{8}$/.test(dateString)) { // YYYYMMDD
                const y = parseInt(dateString.substring(0, 4));
                const m = parseInt(dateString.substring(4, 6));
                const d = parseInt(dateString.substring(6, 8));
                if (!this.isValidDate(y, m, d)) return null;
                return new Date(y, m - 1, d).toISOString().split('T')[0]; // 날짜 부분만
            }
            // 이미 ISO 8601 또는 다른 유효한 형식일 경우 Date 객체로 변환 시도
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? null : date.toISOString();
        } catch (error) {
            console.warn('날짜 형식 변환 오류:', { dateString, error: error.message });
            return null;
        }
    }

    /**
     * 날짜 구성 요소가 유효한 날짜를 형성하는지 확인합니다.
     * @param {number} year - 년도
     * @param {number} month - 월 (1-12)
     * @param {number} day - 일 (1-31)
     * @returns {boolean} 유효성 여부
     */
    static isValidDate(year, month, day) {
        if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && !isNaN(date.getTime());
    }

    /**
     * 날짜 및 시간 구성 요소가 유효한 날짜 및 시간을 형성하는지 확인합니다.
     * @param {number} year - 년도
     * @param {number} month - 월 (1-12)
     * @param {number} day - 일 (1-31)
     * @param {number} hour - 시 (0-23)
     * @param {number} minute - 분 (0-59)
     * @param {number} second - 초 (0-59)
     * @returns {boolean} 유효성 여부
     */
    static isValidDateTime(year, month, day, hour, minute, second) {
        if (!this.isValidDate(year, month, day) || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return false;
        const date = new Date(year, month - 1, day, hour, minute, second);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day &&
            date.getHours() === hour && date.getMinutes() === minute && date.getSeconds() === second && !isNaN(date.getTime());
    }

    /**
     * 아이템의 데이터 완전성(Completeness)을 계산합니다.
     * @param {object} item - 아이템 객체
     * @returns {number} 완전성 백분율 (0-100)
     */
    static calculateCompleteness(item) {
        const fields = ['title', 'addr1', 'tel', 'firstimage', 'mapx', 'mapy', 'overview', 'homepage', 'cat1', 'cat2', 'cat3'];
        const filledFields = fields.filter(field => {
            const value = item[field];
            // 값이 존재하고, 비어있지 않거나, "0", "null" 문자열이 아닌 경우 유효하다고 판단
            return value && value !== '' && value !== '0' && value !== 'null';
        }).length;
        return Math.round((filledFields / fields.length) * 100);
    }

    /**
     * 이미지 아이템 데이터를 처리하고 정규화합니다.
     * @param {object} item - 원본 이미지 아이템 객체
     * @returns {object|null} 처리된 이미지 아이템 객체 또는 null
     */
    static processImageItem(item) {
        try {
            if (!item) return null;
            return {
                contentid: item.contentid,
                imgname: SafeUtils.sanitizeInput(item.imgname),
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

    /**
     * 코드 아이템(지역 코드, 카테고리 코드 등) 데이터를 처리하고 정규화합니다.
     * @param {object} item - 원본 코드 아이템 객체
     * @returns {object|null} 처리된 코드 아이템 객체 또는 null
     */
    static processCodeItem(item) {
        try {
            if (!item) return null;
            return {
                code: item.code,
                name: SafeUtils.sanitizeInput(item.name),
                rnum: item.rnum
            };
        } catch (error) {
            console.warn('Error processing code item:', { item, error: error.message, stack: error.stack });
            return null;
        }
    }

    /**
     * 인스턴스를 파괴하고 리소스를 정리합니다.
     */
    destroy() {
        // console.log('ApiResponseProcessor destroyed'); // 주석 처리: 로거가 파괴될 때 불필요한 로그 방지
    }
}

// ===== 고급 입력 검증기 =====
/**
 * API 요청 파라미터의 유효성을 검증하는 클래스입니다.
 */
class InputValidator {
    constructor(container) {
        this.container = container;
        this.logger = container.get('logger');
        this.i18n = container.get('i18n');
        this.schemas = new Map(); // 각 API 오퍼레이션에 대한 스키마
        this.customValidators = new Map(); // 사용자 정의 유효성 검사 함수
        this._destroyed = false;
        this.initializeDefaultSchemas();
        this.initializeCustomValidators();
    }

    /**
     * 사용자 정의 유효성 검사 함수를 초기화합니다.
     */
    initializeCustomValidators() {
        this.addCustomValidator('contentId', (value) => /^\d+$/.test(value) && SafeUtils.safeParseInt(value) > 0);
        this.addCustomValidator('latitude', (value) => GeoUtils.isValidCoordinate(SafeUtils.safeParseFloat(value), 0));
        this.addCustomValidator('longitude', (value) => GeoUtils.isValidCoordinate(0, SafeUtils.safeParseFloat(value)));
        this.addCustomValidator('areaCode', (value) => {
            const constants = this.container.get('constants');
            return Object.keys(constants.AREA_CODES).includes(String(value));
        });
        this.addCustomValidator('dateFormat', (value) => /^\d{8}$/.test(value) && ApiResponseProcessor.isValidDate(
            SafeUtils.safeParseInt(value.substring(0, 4)),
            SafeUtils.safeParseInt(value.substring(4, 6)),
            SafeUtils.safeParseInt(value.substring(6, 8))
        ));
    }

    /**
     * 기본 스키마들을 초기화합니다.
     */
    initializeDefaultSchemas() {
        // detailCommon API 요청 스키마
        this.schemas.set('detailCommon', {
            contentId: {
                type: 'string', required: true, pattern: /^\d+$/, custom: 'contentId', sanitize: true
            },
            contentTypeId: {
                type: 'string', enum: Object.keys(this.container.get('constants').CONTENT_TYPES), sanitize: true
            },
            defaultYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            firstImageYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            areacodeYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            catcodeYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            addrinfoYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            mapinfoYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            overviewYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' }
        });
        // areaBasedList API 요청 스키마
        this.schemas.set('areaBasedList', {
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '10' },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'O', 'P', 'Q', 'R'], default: 'A' }, // A: 제목순, B: 콘텐츠ID순, C: 수정일순, D: 생성일순, E:거리순, O:제목 가나다순, P:조회순, Q:수정일순, R:생성일순
            contentTypeId: { type: 'string', enum: Object.keys(this.container.get('constants').CONTENT_TYPES), sanitize: true },
            areaCode: { type: 'string', pattern: /^\d{1,2}$/, custom: 'areaCode', sanitize: true },
            sigunguCode: { type: 'string', pattern: /^\d{1,5}$/, sanitize: true },
            cat1: { type: 'string', pattern: /^[A-Z]\d{2}$/, sanitize: true },
            cat2: { type: 'string', pattern: /^[A-Z]\d{4}$/, sanitize: true },
            cat3: { type: 'string', pattern: /^[A-Z]\d{6}$/, sanitize: true },
            listYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            modifiedtime: { type: 'string', pattern: /^\d{14}$/, sanitize: true } // YYYYMMDDHHMMSS
        });
        // searchKeyword API 요청 스키마
        this.schemas.set('searchKeyword', {
            keyword: { type: 'string', required: true, minLength: 1, maxLength: 100, sanitize: true },
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '10' },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'O', 'P', 'Q', 'R'], default: 'A' },
            contentTypeId: { type: 'string', enum: Object.keys(this.container.get('constants').CONTENT_TYPES), sanitize: true },
            areaCode: { type: 'string', pattern: /^\d{1,2}$/, custom: 'areaCode', sanitize: true },
            sigunguCode: { type: 'string', pattern: /^\d{1,5}$/, sanitize: true }
        });
        this.setupDetailSchemas();
        this.setupLocationSchemas();
        this.setupCodeSchemas();
    }

    /**
     * 상세 정보 관련 API 스키마를 설정합니다.
     */
    setupDetailSchemas() {
        this.schemas.set('detailIntro', {
            contentId: { type: 'string', required: true, pattern: /^\d+$/, custom: 'contentId', sanitize: true },
            contentTypeId: { type: 'string', required: true, enum: Object.keys(this.container.get('constants').CONTENT_TYPES), sanitize: true }
        });
        this.schemas.set('detailInfo', {
            contentId: { type: 'string', required: true, pattern: /^\d+$/, custom: 'contentId', sanitize: true },
            contentTypeId: { type: 'string', required: true, enum: Object.keys(this.container.get('constants').CONTENT_TYPES), sanitize: true }
        });
        this.schemas.set('detailImage', {
            contentId: { type: 'string', required: true, pattern: /^\d+$/, custom: 'contentId', sanitize: true },
            imageYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            subImageYN: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '10' }, // 추가
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' } // 추가
        });
    }

    /**
     * 위치 기반 및 축제 검색 API 스키마를 설정합니다.
     */
    setupLocationSchemas() {
        this.schemas.set('locationBasedList', {
            mapX: { type: 'string', required: true, pattern: /^-?\d+(\.\d+)?$/, custom: 'longitude', sanitize: true },
            mapY: { type: 'string', required: true, pattern: /^-?\d+(\.\d+)?$/, custom: 'latitude', sanitize: true },
            radius: { type: 'string', pattern: /^\d+$/, min: 1, max: 20000, default: '1000' }, // 반경 1m ~ 20000m (20km)
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '10' },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'], default: 'A' },
            contentTypeId: { type: 'string', enum: Object.keys(this.container.get('constants').CONTENT_TYPES), sanitize: true }
        });
        this.schemas.set('searchFestival', {
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '10' },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' },
            arrange: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'O', 'Q', 'R'], default: 'A' },
            eventStartDate: { type: 'string', pattern: /^\d{8}$/, custom: 'dateFormat', sanitize: true }, // YYYYMMDD
            eventEndDate: { type: 'string', pattern: /^\d{8}$/, custom: 'dateFormat', sanitize: true }, // YYYYMMDD
            areaCode: { type: 'string', pattern: /^\d{1,2}$/, custom: 'areaCode', sanitize: true },
            sigunguCode: { type: 'string', pattern: /^\d{1,5}$/, sanitize: true }
        });
    }

    /**
     * 코드 정보 관련 API 스키마를 설정합니다.
     */
    setupCodeSchemas() {
        this.schemas.set('areaCode', {
            areaCode: { type: 'string', pattern: /^\d{1,2}$/, custom: 'areaCode', sanitize: true }, // 시군구 코드 조회 시 사용
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '100' },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' }
        });
        this.schemas.set('categoryCode', {
            contentTypeId: { type: 'string', enum: Object.keys(this.container.get('constants').CONTENT_TYPES), sanitize: true },
            cat1: { type: 'string', pattern: /^[A-Z]\d{2}$/, sanitize: true }, // 대분류
            cat2: { type: 'string', pattern: /^[A-Z]\d{4}$/, sanitize: true }, // 중분류
            cat3: { type: 'string', pattern: /^[A-Z]\d{6}$/, sanitize: true }, // 소분류
            numOfRows: { type: 'string', pattern: /^\d+$/, min: 1, max: 1000, default: '100' },
            pageNo: { type: 'string', pattern: /^\d+$/, min: 1, default: '1' }
        });
    }

    /**
     * 주어진 스키마에 따라 파라미터의 유효성을 검사합니다.
     * @param {string} operation - API 오퍼레이션 이름
     * @param {object} params - 검증할 파라미터 객체
     * @returns {object} 유효성 검사를 통과한 파라미터
     * @throws {ValidationError} 유효성 검사 실패 시
     */
    validate(operation, params) {
        if (this._destroyed) throw new Error('InputValidator has been destroyed.');
        const schema = this.schemas.get(operation);
        if (!schema) {
            this.logger.warn('검증 스키마 없음. 파라미터 유효성 검사 생략.', { operation });
            return params; // 스키마가 없으면 원본 파라미터 반환 (또는 에러 throw)
        }
        const validatedParams = {};
        const errors = [];
        const i18n = this.i18n; // i18n 인스턴스 가져오기

        for (const field in schema) {
            const rules = schema[field];
            let value = params[field];

            // 필수 항목 검사
            if ((value === undefined || value === null || value === '') && rules.required) {
                errors.push(i18n.getMessage('VALIDATION_ERROR_FIELD', { field, message: '필수 항목입니다.' }));
                continue;
            }

            // 기본값 설정 (값이 없거나 비어있을 때)
            if ((value === undefined || value === null || value === '') && rules.default !== undefined) {
                value = rules.default;
            }

            if (value !== undefined && value !== null && value !== '') {
                const validationResult = this._validateField(field, value, rules, i18n);
                if (validationResult.errors.length > 0) {
                    errors.push(...validationResult.errors);
                } else {
                    validatedParams[field] = validationResult.value;
                }
            }
        }

        // 추가적인 비즈니스 로직 검증 (예: 시작일이 종료일보다 늦을 수 없음)
        this.validateBusinessLogic(operation, { ...params, ...validatedParams }, errors, i18n);

        if (errors.length > 0) {
            this.logger.warn('입력값 검증 실패', { operation, errors, originalParams: params });
            throw new ValidationError(errors.join('; '), 'multiple', params, i18n); // 모든 에러 메시지 합치기
        }
        return validatedParams;
    }

    /**
     * 단일 필드의 유효성을 검사합니다.
     * @param {string} field - 필드 이름
     * @param {*} value - 필드 값
     * @param {object} rules - 검증 규칙
     * @param {InternationalizationManager} i18n - 국제화 매니저
     * @returns {{value: *, errors: string[]}} 검증 결과 객체
     * @private
     */
    _validateField(field, value, rules, i18n) {
        const result = { value: undefined, errors: [] };
        let processedValue = value;
        try {
            // 1. Sanitize
            if (rules.sanitize && typeof processedValue === 'string') {
                processedValue = SafeUtils.sanitizeInput(processedValue, rules.maxLength || 1000);
            }

            // 2. Type conversion/check
            if (rules.type) {
                if (rules.type === 'string') {
                    processedValue = String(processedValue); // 모든 값을 문자열로 변환
                } else if (rules.type === 'number') {
                    const numValue = SafeUtils.safeParseFloat(processedValue);
                    if (isNaN(numValue)) {
                        result.errors.push(i18n.getMessage('NUMERIC_ERROR', { field }));
                        return result;
                    }
                    processedValue = numValue;
                }
                // 다른 타입 검증 추가 가능 (boolean 등)
            }

            // 3. Pattern (Regex)
            if (rules.pattern && typeof processedValue === 'string') {
                const regex = new RegExp(rules.pattern);
                if (!regex.test(processedValue)) {
                    result.errors.push(i18n.getMessage('INVALID_FORMAT', { field, message: `패턴 불일치: ${rules.pattern}` }));
                    return result;
                }
            }

            // 4. Length (for strings)
            if (typeof processedValue === 'string') {
                if (rules.minLength && processedValue.length < rules.minLength) {
                    result.errors.push(i18n.getMessage('MIN_LENGTH_ERROR', {
                        minLength: rules.minLength,
                        actual: processedValue.length,
                        field
                    }));
                    return result;
                }
                if (rules.maxLength && processedValue.length > rules.maxLength) {
                    result.errors.push(i18n.getMessage('MAX_LENGTH_ERROR', {
                        maxLength: rules.maxLength,
                        actual: processedValue.length,
                        field
                    }));
                    return result;
                }
            }

            // 5. Range (for numbers)
            if (rules.min !== undefined || rules.max !== undefined) {
                const numValue = SafeUtils.safeParseFloat(processedValue);
                if (isNaN(numValue)) { // 이미 위에서 number type check로 걸러졌을 수 있지만, 한 번 더
                    result.errors.push(i18n.getMessage('NUMERIC_ERROR', { field }));
                    return result;
                }
                if (rules.min !== undefined && numValue < rules.min) {
                    result.errors.push(i18n.getMessage('INVALID_RANGE', {
                        field,
                        min: rules.min,
                        max: rules.max || '∞'
                    }));
                    return result;
                }
                if (rules.max !== undefined && numValue > rules.max) {
                    result.errors.push(i18n.getMessage('INVALID_RANGE', {
                        field,
                        min: rules.min || '-∞',
                        max: rules.max
                    }));
                    return result;
                }
            }

            // 6. Enum
            if (rules.enum && !rules.enum.includes(processedValue)) {
                result.errors.push(i18n.getMessage('ENUM_ERROR', {
                    values: rules.enum.join(', '),
                    field
                }));
                return result;
            }

            // 7. Custom validator
            if (rules.custom && this.customValidators.has(rules.custom)) {
                const customValidator = this.customValidators.get(rules.custom);
                if (!customValidator(processedValue)) {
                    result.errors.push(i18n.getMessage('INVALID_FORMAT', { field, message: '사용자 정의 검증 실패' }));
                    return result;
                }
            }

            result.value = processedValue;
            return result;
        } catch (error) {
            this.logger.error('Field validation error', {
                field, value, rules, error: error.message, stack: error.stack
            });
            result.errors.push(`${field}: ${i18n.getMessage('UNKNOWN_ERROR')} (${error.message})`);
            return result;
        }
    }

    /**
     * API 오퍼레이션별 비즈니스 로직 유효성을 검사합니다.
     * @param {string} operation - API 오퍼레이션 이름
     * @param {object} params - 검증된 파라미터 객체
     * @param {string[]} errors - 에러 메시지 배열 (여기에 추가)
     * @param {InternationalizationManager} i18n - 국제화 매니저
     */
    validateBusinessLogic(operation, params, errors, i18n) {
        try {
            // 축제 검색: 시작일이 종료일보다 늦을 수 없음
            if (operation === 'searchFestival' && params.eventStartDate && params.eventEndDate) {
                const startDateNum = SafeUtils.safeParseInt(params.eventStartDate);
                const endDateNum = SafeUtils.safeParseInt(params.eventEndDate);
                if (!isNaN(startDateNum) && !isNaN(endDateNum) && startDateNum > endDateNum) {
                    errors.push(i18n.getMessage('INVALID_RANGE', {
                        field: 'eventStartDate/eventEndDate',
                        min: params.eventEndDate,
                        max: params.eventStartDate,
                        message: '시작일은 종료일보다 빠르거나 같아야 합니다.'
                    }));
                }
            }
            // 위치 기반 목록: mapX, mapY 필수
            if (operation === 'locationBasedList') {
                if (!params.mapX || !params.mapY) {
                    errors.push(i18n.getMessage('VALIDATION_ERROR_FIELD', { field: 'mapX, mapY', message: '위치 기반 검색에는 mapX, mapY가 필수입니다.' }));
                } else if (!GeoUtils.isValidCoordinate(params.mapY, params.mapX)) { // mapY가 위도, mapX가 경도
                    errors.push(i18n.getMessage('INVALID_COORDINATES', {
                        lat: params.mapY,
                        lng: params.mapX
                    }));
                }
            }
            // areaCode 조회 시, areaCode 파라미터가 있으면 시군구 코드 조회
            if (operation === 'areaCode' && params.areaCode && !this.customValidators.get('areaCode')(params.areaCode)) {
                errors.push(i18n.getMessage('VALIDATION_ERROR_FIELD', { field: 'areaCode', message: '유효하지 않은 지역 코드입니다.' }));
            }
        } catch (error) {
            this.logger.error('Business logic validation error', {
                operation,
                error: error.message,
                stack: error.stack
            });
            errors.push(i18n.getMessage('UNKNOWN_ERROR', { message: `비즈니스 로직 검증 중 오류 발생: ${error.message}` }));
        }
    }

    /**
     * 사용자 정의 유효성 검사 함수를 추가합니다.
     * @param {string} name - 검사기 이름
     * @param {function(*): boolean} validator - 유효성 검사 함수
     * @throws {Error} 함수가 아닌 경우
     */
    addCustomValidator(name, validator) {
        if (typeof validator !== 'function') {
            throw new Error('Validator must be a function');
        }
        this.customValidators.set(name, validator);
    }

    /**
     * 사용자 정의 유효성 검사 함수를 제거합니다.
     * @param {string} name - 제거할 검사기 이름
     * @returns {boolean} 제거 성공 여부
     */
    removeCustomValidator(name) {
        return this.customValidators.delete(name);
    }

    /**
     * 특정 오퍼레이션의 유효성 검사 스키마를 반환합니다.
     * @param {string} operation - 오퍼레이션 이름
     * @returns {object|undefined} 스키마 객체
     */
    getValidationSchema(operation) {
        return this.schemas.get(operation);
    }

    /**
     * 인스턴스를 파괴하고 리소스를 정리합니다.
     */
    destroy() {
        if (this._destroyed) return;
        this.schemas.clear();
        this.customValidators.clear();
        this._destroyed = true;
        // this.logger.info('Input validator destroyed'); // 주석 처리: 로거가 파괴될 때 불필요한 로그 방지
    }
}

// ===== 메인 API 클래스 =====
/**
 * 한국관광공사 API와 상호작용하는 메인 클래스입니다.
 * 모든 API 호출은 이 클래스를 통해 이루어지며, 의존성 주입을 활용합니다.
 */
class AllTourismAPI {
    constructor() {
        this.container = new ServiceContainer();
        this.setupServices();
        this.container.initialize();
        this.container.get('config').validateConfig(); // 설정 유효성 검사
    }

    /**
     * 서비스 컨테이너에 필요한 서비스들을 등록합니다.
     * (의존성 주입 설정)
     */
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

    /**
     * 시스템 상태 정보를 가져옵니다.
     * @returns {object} 시스템 상태 정보
     */
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
                    apiKeyConfigured: !!config.get('apiKey')
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

    /**
     * 캐시를 초기화합니다.
     * @returns {object} 캐시 초기화 결과
     */
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

    /**
     * 지역 기반 관광 정보를 조회합니다.
     * @param {object} params - 요청 파라미터
     * @returns {Promise<object>} 관광 정보 목록
     * @throws {BaseError} API 호출 또는 검증 오류 발생 시
     */
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
                // 필수 기본 파라미터는 HttpClient에서 추가되므로 여기서는 제외
            };
            const data = await httpClient.getTourismData('areaBasedList', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            // GeoUtils.addDistanceInfo 호출 시 mapx와 mapy 필드를 mapy(위도)와 mapx(경도)로 전달해야 함.
            // 한국관광공사 API의 mapx, mapy 필드명과 GeoUtils의 lat, lng 인자 순서에 유의.
            const processedItems = items.map(item => ApiResponseProcessor.processBasicItem(item, this.container))
                .filter(Boolean); // 유효하지 않은 항목 필터링

            // 사용자 위치 정보가 있다면 거리 정보 추가 및 필터링
            if (validatedParams.mapX && validatedParams.mapY && validatedParams.radius) {
                // mapY가 위도, mapX가 경도
                const userLat = SafeUtils.safeParseFloat(validatedParams.mapY);
                const userLng = SafeUtils.safeParseFloat(validatedParams.mapX);
                const radius = SafeUtils.safeParseFloat(validatedParams.radius);
                if (GeoUtils.isValidCoordinate(userLat, userLng) && radius > 0) {
                    logger.info('위치 기반 필터링 및 거리 계산 적용', { requestId, userLat, userLng, radius });
                    const filteredAndSortedItems = GeoUtils.addDistanceInfo(processedItems, userLat, userLng, radius);
                    processedItems.splice(0, processedItems.length, ...filteredAndSortedItems); // 배열 교체
                } else {
                    logger.warn('유효하지 않은 사용자 위치 또는 반경. 위치 기반 필터링 건너뜀.', { requestId, userLat, userLng, radius });
                }
            }

            const result = ResponseFormatter.formatSuccess('areaBasedList', {
                totalCount: data.response?.body?.totalCount || 0,
                pageNo: SafeUtils.safeParseInt(data.response?.body?.pageNo, 1),
                numOfRows: SafeUtils.safeParseInt(data.response?.body?.numOfRows, 10),
                items: processedItems
            });
            cache.set(cacheKey, result); // 캐시 저장
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

    /**
     * 공통 정보 조회 (단일 콘텐츠의 상세 정보)
     * @param {object} params - 요청 파라미터 (contentId, contentTypeId 등)
     * @returns {Promise<object>} 상세 정보 객체
     */
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
            const apiParams = { ...validatedParams };
            const data = await httpClient.getTourismData('detailCommon', apiParams, { requestId });
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

    /**
     * 소개 정보 조회 (단일 콘텐츠의 소개 정보)
     * @param {object} params - 요청 파라미터 (contentId, contentTypeId)
     * @returns {Promise<object>} 소개 정보 객체
     */
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
            const apiParams = { ...validatedParams };
            const data = await httpClient.getTourismData('detailIntro', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            const processedItem = items.length > 0 ? items[0] : null; // detailIntro는 단일 아이템을 반환하는 경우가 많음
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

    /**
     * 반복 정보 조회 (숙박, 음식점 등의 추가 정보)
     * @param {object} params - 요청 파라미터 (contentId, contentTypeId)
     * @returns {Promise<object>} 반복 정보 목록
     */
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
            const apiParams = { ...validatedParams };
            const data = await httpClient.getTourismData('detailInfo', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            // detailInfo는 여러 아이템을 반환할 수 있으므로, 각 아이템을 개별적으로 처리 (필요시)
            // 현재는 원본 아이템 반환
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

    /**
     * 이미지 정보 조회 (콘텐츠의 이미지 목록)
     * @param {object} params - 요청 파라미터 (contentId, imageYN, subImageYN)
     * @returns {Promise<object>} 이미지 정보 목록
     */
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
            const apiParams = { ...validatedParams };
            const data = await httpClient.getTourismData('detailImage', apiParams, { requestId });
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

    /**
     * 키워드 검색 (제목, 개요 기반)
     * @param {object} params - 요청 파라미터 (keyword, areaCode 등)
     * @returns {Promise<object>} 검색 결과 목록
     */
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
            const apiParams = { ...validatedParams };
            const data = await httpClient.getTourismData('searchKeyword', apiParams, { requestId });
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

    /**
     * 축제/공연/행사 정보 검색
     * @param {object} params - 요청 파라미터 (eventStartDate, areaCode 등)
     * @returns {Promise<object>} 축제 정보 목록
     */
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
            const apiParams = { ...validatedParams };
            const data = await httpClient.getTourismData('searchFestival', apiParams, { requestId });
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

    /**
     * 위치 기반 관광 정보 조회 (현재 위치 주변)
     * @param {object} params - 요청 파라미터 (mapX, mapY, radius 등)
     * @returns {Promise<object>} 관광 정보 목록
     */
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
            const apiParams = { ...validatedParams };
            const data = await httpClient.getTourismData('locationBasedList', apiParams, { requestId });
            const items = ApiResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ApiResponseProcessor.processBasicItem(item, this.container))
                .filter(Boolean);
            // GeoUtils.addDistanceInfo 함수는 API 응답의 mapx, mapy를 기반으로 거리 계산을 수행합니다.
            // 여기서는 이미 API 호출 시 radius를 파라미터로 넘겨 필터링이 된 상태일 수 있으므로
            // 추가적인 거리 계산 및 필터링은 필요에 따라 주석 처리 또는 재활용.
            // 만약 API에서 거리순 정렬이나 반경 필터링이 완벽하지 않다면 여기서 추가 처리 가능.
            // 예를 들어, API 응답에 distance 필드가 없는 경우 GeoUtils.addDistanceInfo를 호출하여 추가할 수 있습니다.
            if (processedItems.length > 0 && !processedItems[0].distance && validatedParams.mapX && validatedParams.mapY && validatedParams.radius) {
                const userLat = SafeUtils.safeParseFloat(validatedParams.mapY); // mapY가 위도
                const userLng = SafeUtils.safeParseFloat(validatedParams.mapX); // mapX가 경도
                const radius = SafeUtils.safeParseFloat(validatedParams.radius);
                if (GeoUtils.isValidCoordinate(userLat, userLng) && radius > 0) {
                    logger.info('위치 기반 필터링 및 거리 계산 (API 응답 후 재처리)', { requestId, userLat, userLng, radius });
                    const filteredAndSortedItems = GeoUtils.addDistanceInfo(processedItems, userLat, userLng, radius);
                    processedItems.splice(0, processedItems.length, ...filteredAndSortedItems); // 배열 교체
                }
            }
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

    /**
     * 지역 코드 목록을 조회합니다.
     * @param {object} params - 요청 파라미터 (areaCode: 시군구 코드 조회 시)
     * @returns {Promise<object>} 지역 코드 목록
     */
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
            const apiParams = { ...validatedParams };
            const data = await httpClient.getTourismData('areaCode', apiParams, { requestId });
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
            cache.set(cacheKey, result, constants.CACHE_SETTINGS.longTTL); // 코드 정보는 자주 변하지 않으므로 긴 TTL 적용
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

    /**
     * 서비스 분류 코드 목록을 조회합니다 (대/중/소분류).
     * @param {object} params - 요청 파라미터 (contentTypeId, cat1, cat2)
     * @returns {Promise<object>} 분류 코드 목록
     */
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
            const apiParams = { ...validatedParams };
            const data = await httpClient.getTourismData('categoryCode', apiParams, { requestId });
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

    /**
     * 여러 API 요청을 일괄 처리합니다.
     * @param {Array<object>} operations - 실행할 작업 목록 (각 { operation: 'API_NAME', params: {} } 형태)
     * @returns {Promise<object>} 배치 처리 결과
     */
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
            const maxBatchSize = config.get('batchMaxOperations'); // ConfigManager에서 최대 배치 크기 가져오기
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
            const constants = this.container.get('constants');
            for (let i = 0; i < operations.length; i++) {
                const op = operations[i];
                const { operation, params = {} } = op;
                try {
                    if (!constants.isValidOperation(operation)) {
                        throw new ValidationError(
                            i18n.getMessage('UNSUPPORTED_OPERATION', { operation }),
                            'operation',
                            operation,
                            i18n
                        );
                    }
                    let result;
                    // 각 API 호출은 이미 자체적으로 try-catch로 감싸져 있으므로, 여기서는 호출만 수행
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
                            // isValidOperation에서 걸러지지만, 만약을 위해 추가
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
                        metadata: errorResponse.metadata // 에러 발생 시의 메타데이터 포함
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

    /**
     * API 인스턴스를 파괴하고 모든 의존성 리소스를 정리합니다.
     */
    destroy() {
        if (this.container) {
            this.container.destroy();
        }
        // console.log('AllTourismAPI instance destroyed'); // 주석 처리: 로거가 파괴될 때 불필요한 로그 방지
    }
}

// ===== CORS 헤더 설정 유틸리티 함수 =====
/**
 * HTTP 응답에 CORS 헤더를 설정합니다.
 * @param {object} res - HTTP 응답 객체
 * @param {string} allowedOrigins - 허용할 Origin (기본값: '*')
 */
function setCorsHeaders(res, allowedOrigins = '*') {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization,X-API-KEY');
    res.setHeader('Access-Control-Allow-Credentials', true);
}

// ===== 헬스체크 함수 (서버리스 환경에서 사용) =====
/**
 * API 서비스의 건강 상태를 확인하는 함수입니다.
 * @returns {Promise<object>} 헬스체크 결과
 */
async function healthCheck() {
    let api = null;
    try {
        api = new AllTourismAPI();
        const config = api.container.get('config');
        const apiKey = config.get('apiKey');
        const i18n = api.container.get('i18n');
        // Node.js 환경에서 API 키가 설정되지 않았다면 오류 반환
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
        // 간단한 API 호출 테스트 (예: areaCode)를 통해 실제 API 서버와의 연결 및 키 유효성 간접 확인
        // numOfRows를 1로 설정하여 최소한의 데이터를 요청
        await api.areaCode({ numOfRows: '1' });
        return {
            status: 'ok',
            message: 'API is healthy and running',
            details: {
                version: config.get('version'),
                environment: config.get('environment'),
                apiKeyConfigured: !!apiKey, // 실제 API 키가 설정되었는지 여부
                timestamp: new Date().toISOString()
            }
        };
    } catch (error) {
        console.warn('Health check failed:', error.message, error.stack);
        return {
            status: 'error',
            message: 'API health check failed.',
            details: {
                error: error.message,
                code: error.code || 'UNKNOWN_HEALTH_ERROR',
                statusCode: error.statusCode || 500,
                apiKeyConfigured: !!(api && api.container.get('config').get('apiKey')),
                timestamp: new Date().toISOString()
            }
        };
    } finally {
        if (api) {
            api.destroy(); // 리소스 정리
        }
    }
}

// ===== 메인 서버리스 함수 핸들러 =====
/**
 * Vercel 등 서버리스 환경에서 요청을 처리하는 메인 핸들러입니다.
 * @param {object} req - HTTP 요청 객체
 * @param {object} res - HTTP 응답 객체
 */
async function handler(req, res) {
    const requestId = SafeUtils.generateRequestId();
    const startTime = Date.now();
    let api = null;
    let logger = null;
    let i18n = null;
    let configManager = null;
    try {
        setCorsHeaders(res); // CORS 헤더 설정
        if (req.method === 'OPTIONS') {
            res.status(200).end(); // Pre-flight 요청 처리
            return;
        }

        api = new AllTourismAPI();
        logger = api.container.get('logger');
        i18n = api.container.get('i18n');
        configManager = api.container.get('config');

        // 요청 언어 설정 (쿼리 파라미터 'lang' 또는 'Accept-Language' 헤더에서 가져오기)
        const lang = req.query?.lang || req.headers?.['accept-language']?.split(',')[0]?.split('-')[0] || 'ko';
        i18n.setLanguage(lang);

        logger.info('요청 수신', {
            requestId,
            method: req.method,
            url: req.url,
            ip: req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress, // req.connection.remoteAddress 대신 req.socket.remoteAddress 사용
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
                    // Vercel 환경에서는 req.body가 이미 JSON으로 파싱되어 있을 수 있음
                    // 아닐 경우 raw body를 JSON.parse
                    params = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
                } else if (contentType.includes('application/x-www-form-urlencoded')) {
                    // 서버리스 환경에서는 req.body가 이미 파싱된 객체이거나 문자열일 수 있음
                    params = typeof req.body === 'string' ? require('querystring').parse(req.body) : req.body || {};
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

        const { operation = 'areaBasedList', ...apiParams } = params; // 기본 오퍼레이션 설정

        // 특수 오퍼레이션 (health, systemStatus, clearCache, batch) 처리
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
            // 배치 요청은 별도의 핸들러 `batchHandler`에서 처리되므로, 여기서는 그 함수를 호출하거나 직접 구현
            const { operations: batchOperations } = apiParams; // 배치 요청의 실제 작업 목록
            const batchResult = await api.batchRequest(batchOperations);
            batchResult.metadata = {
                ...batchResult.metadata,
                requestId,
                totalTime: Date.now() - startTime,
                version: configManager.get('version')
            };
            res.status(200).json(batchResult);
            return;
        }

        // 일반 API 오퍼레이션 처리
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
                // isValidOperation에서 걸러지므로 이 코드는 실행되지 않음
                throw new ValidationError(
                    i18n.getMessage('UNSUPPORTED_OPERATION', { operation }),
                    'operation',
                    operation,
                    i18n
                );
        }

        // 응답 메타데이터 추가
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
                api.destroy(); // API 인스턴스 리소스 정리
            } catch (cleanupError) {
                if (logger) logger.warn('리소스 정리 경고:', { error: cleanupError.message });
                else console.warn('리소스 정리 경고 (로거 미초기화):', cleanupError);
            }
        }
    }
}

// ===== 배치 처리 전용 핸들러 (서버리스 환경에서 사용) =====
/**
 * 배치 요청을 처리하는 전용 핸들러입니다.
 * @param {object} req - HTTP 요청 객체
 * @param {object} res - HTTP 응답 객체
 */
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
        const config = api.container.get('config'); // ConfigManager 인스턴스 가져오기

        logger.info('배치 요청 수신', {
            requestId,
            method: req.method
        });

        // 요청 본문에서 operations와 options를 파싱
        // req.body는 서버리스 환경에서 이미 파싱되어 있을 수 있음
        const { operations, options = {} } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

        if (!Array.isArray(operations) || operations.length === 0) {
            throw new ValidationError(
                'operations 배열이 필요합니다',
                'operations',
                operations,
                i18n
            );
        }

        const maxBatchSize = options.maxBatchSize || config.get('batchMaxOperations'); // ConfigManager에서 가져온 값 우선, 없으면 기본값 사용
        if (operations.length > maxBatchSize) {
            throw new ValidationError(
                i18n.getMessage('BATCH_SIZE_EXCEEDED', { max: maxBatchSize, actual: operations.length }),
                'operations',
                operations.length,
                i18n
            );
        }

        const batchOptions = {
            concurrency: Math.min(options.concurrency || 5, 10), // 동시성 제한 (최대 10)
            timeout: options.timeout || 30000, // 개별 요청 타임아웃
            stopOnError: options.stopOnError || false // 오류 발생 시 중단 여부
        };

        logger.info('배치 처리 시작', {
            requestId,
            operationCount: operations.length,
            options: batchOptions
        });

        const batchResult = await api.batchRequest(operations); // AllTourismAPI의 batchRequest 메서드 호출

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

// ===== 메트릭 수집 핸들러 (서버리스 환경에서 사용) =====
/**
 * 시스템 메트릭을 수집하고 반환하는 핸들러입니다.
 * @param {object} req - HTTP 요청 객체
 * @param {object} res - HTTP 응답 객체
 */
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
            metrics: logger.getMetrics(), // 로거에서 수집된 메트릭
            cache: {
                ...cache.getStats(),
                topItems: cache.getTopItems(10) // 상위 캐시 항목 10개
            },
            rateLimiter: rateLimiter.getStats()
        };

        // Prometheus 형식 요청 처리
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
/**
 * JSON 형식의 메트릭 데이터를 Prometheus 텍스트 형식으로 변환합니다.
 * @param {object} metrics - 메트릭 데이터 객체
 * @returns {string} Prometheus 형식의 메트릭 문자열
 */
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

    // logger에서 수집된 커스텀 메트릭 처리
    Object.entries(metrics.metrics).forEach(([key, metric]) => {
        // Prometheus 메트릭 이름 규칙에 맞게 변환
        const metricName = `${prefix}${key.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        lines.push(`# HELP ${metricName} ${metric.name || key}`);
        lines.push(`# TYPE ${metricName} gauge`); // 또는 counter
        lines.push(`${metricName} ${metric.avg || metric.count || 0}`);
    });

    lines.push(`# HELP ${prefix}rate_limiter_limited_requests_total Total number of requests limited by rate limiter`);
    lines.push(`# TYPE ${prefix}rate_limiter_limited_requests_total counter`);
    lines.push(`${prefix}rate_limiter_limited_requests_total ${metrics.rateLimiter.limitedRequests}`);

    lines.push(`# HELP ${prefix}rate_limiter_current_window_requests Current requests in rate limit window`);
    lines.push(`# TYPE ${prefix}rate_limiter_current_window_requests gauge`);
    lines.push(`${prefix}rate_limiter_current_window_requests ${metrics.rateLimiter.currentWindowRequests}`);

    return lines.join('\n') + '\n';
}

// ===== 모듈 내보내기 (Node.js 환경 전용) =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = handler; // 기본 핸들러
    module.exports.handler = handler;
    module.exports.batch = batchHandler; // 배치 요청 핸들러
    module.exports.metrics = metricsHandler; // 메트릭 핸들러
    module.exports.healthCheck = healthCheck; // 헬스체크 함수

    // 테스트 또는 확장용으로 핵심 클래스들을 내보낼 수 있음
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
} else if (typeof window !== 'undefined') {
    // 브라우저 환경에서는 이 서버리스 API 클라이언트의 핵심 로직을 직접 노출하지 않습니다.
    // 이는 API 키와 같은 민감한 정보의 노출 위험을 방지하고,
    // 클라이언트가 서버리스 함수를 통해서만 API에 접근하도록 강제하기 위함입니다.
    // 필요 시, 브라우저 환경에서 사용할 별도의 공개용 유틸리티 또는 API 클라이언트를 구현해야 합니다.
}

// ===== 전역 에러 핸들러 (Node.js 환경에서만) =====
if (hasProcess) {
    // 전역 에러 발생 시 사용할 간소화된 로거.
    // 전체 DI 컨테이너를 초기화하는 것은 비효율적이며, 컨테이너가 파괴된 후에는 불가능합니다.
    const globalConsoleLogger = {
        error: (message, data = {}) => {
            console.error(`[GLOBAL ERROR] ${new Date().toISOString()} ${message}`, data);
        },
        warn: (message, data = {}) => {
            console.warn(`[GLOBAL WARN] ${new Date().toISOString()} ${message}`, data);
        }
    };

    process.on('uncaughtException', (error) => {
        globalConsoleLogger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
        // 프로덕션 환경에서는 즉시 종료하지 않고, 로깅 후 그레이스풀 셧다운 시도 가능
        // 서버리스 환경에서는 런타임이 보통 인스턴스를 종료합니다.
        // process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        globalConsoleLogger.error('Unhandled Rejection:', { promise, reason: reason?.message || String(reason), stack: reason?.stack });
    });

    // SIGTERM, SIGINT 핸들러는 서버리스 환경에서는 Vercel이 관리하므로 불필요할 수 있음
    // process.on('SIGTERM', () => { ... });
    // process.on('SIGINT', () => { ... });
}

// ===== API 버전 정보 =====
const API_VERSION = '2.1.2'; // 버전 업데이트
const API_BUILD_DATE = new Date().toISOString();

if (typeof module !== 'undefined' && module.exports) {
    module.exports.VERSION = API_VERSION;
    module.exports.BUILD_DATE = API_BUILD_DATE;
} else if (typeof window !== 'undefined') {
    // 브라우저 환경에서는 버전 정보도 직접 노출하지 않습니다.
    // window.TOURISM_API_VERSION = API_VERSION;
    // window.TOURISM_API_BUILD_DATE = API_BUILD_DATE;
}

console.log(`🚀 All Tourism API v${API_VERSION} 로드 완료 (${new Date().toISOString()})`);
