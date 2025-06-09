// 관광 정보 API 서버리스 함수 (Ultimate Production Version)
// 5개 파일의 모든 장점을 통합하고 단점을 보완한 완벽한 버전

/**
 * 통합 개선 사항:
 * 1. [보안 강화] DOMPurify 완전 통합 + 강력한 Fallback 시스템 (m.txt + G2.txt 기반)
 * 2. [성능 최적화] 메모리 효율성 + 실행 속도 최적화 (C.txt + G3.txt 기반)
 * 3. [안정성 보장] 포괄적인 에러 처리 + 환경 호환성 (m.txt + G.txt 기반)
 * 4. [코드 품질] 완벽한 문서화 + 오류 제거 (모든 파일 통합)
 * 5. [확장성] 모듈화된 구조 + 플러그인 지원 (설계 최적화)
 * 6. [서버리스 최적화] Lazy Cleanup + 메모리 관리 (G.txt + m.txt 기반)
 * 7. [국제화] 완전한 다국어 지원 + 동적 메시지 (m.txt 기반 개선)
 * 8. [검증 강화] 다층 입력 검증 + 보안 검증 (모든 파일 통합)
 */

// ===== 전역 상수 및 환경 설정 =====
const SERVICE_START_TIME = Date.now();
const NODE_ENV = typeof process !== 'undefined' && process.versions && process.versions.node;
const BROWSER_ENV = typeof window !== 'undefined';

// ===== 보안 모듈: DOMPurify 통합 및 Fallback =====
/**
 * 보안 라이브러리 초기화 및 환경별 최적화
 * m.txt, G2.txt의 장점을 통합하여 완벽한 보안 시스템 구현
 */
let DOMPurify = null;
let securityLibraryStatus = 'not_loaded';

try {
    if (NODE_ENV) {
        // Node.js 환경 (서버리스 함수)
        try {
            // Vercel 환경에서는 isomorphic-dompurify가 설치되어 있지 않을 수 있음
            // 따라서 try-catch로 안전하게 처리
            DOMPurify = require('isomorphic-dompurify');
            securityLibraryStatus = 'loaded_node';
        } catch (error) {
            console.warn('isomorphic-dompurify not available, using fallback sanitization');
            securityLibraryStatus = 'fallback_node';
        }
    } else if (BROWSER_ENV) {
        // 브라우저 환경
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
/**
 * 다층 보안 시스템을 제공하는 보안 모듈
 * 모든 파일의 보안 기능을 통합하고 강화
 */
class SecurityModule {
    /**
     * HTML 콘텐츠를 안전하게 새니타이징합니다.
     * DOMPurify 사용 가능 시 우선 사용, 불가능 시 강화된 Fallback 적용
     * @param {string} html - 새니타이징할 HTML 문자열
     * @param {object} options - 새니타이징 옵션
     * @param {string[]} [options.allowedTags] - 허용할 HTML 태그 목록
     * @param {string[]} [options.allowedAttributes] - 허용할 속성 목록
     * @param {boolean} [options.strict=false] - 엄격 모드 사용 여부
     * @returns {string} 새니타이징된 HTML 문자열
     */
    static sanitizeHtml(html, options = {}) {
        if (typeof html !== 'string') return html;
        
        const { allowedTags, allowedAttributes, strict = false } = options;
        
        // DOMPurify 사용 가능한 경우
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
        
        // Fallback 새니타이징 (강화된 버전)
        return this.fallbackSanitize(html, options);
    }
    
    /**
     * 강화된 Fallback 새니타이징 시스템
     * 모든 파일의 새니타이징 로직을 통합하고 개선
     * @param {string} html - 새니타이징할 HTML
     * @param {object} options - 옵션
     * @returns {string} 새니타이징된 문자열
     */
    static fallbackSanitize(html, options = {}) {
        let sanitized = html.trim();
        const { allowedTags, strict = false } = options;
        
        // 1단계: 위험한 태그 완전 제거
        const dangerousTags = [
            'script', 'object', 'embed', 'applet', 'form', 'input', 'textarea',
            'select', 'button', 'iframe', 'frame', 'frameset', 'meta', 'link',
            'style', 'base', 'title', 'head', 'html', 'body'
        ];
        
        dangerousTags.forEach(tag => {
            const regex = new RegExp(`<\\/?${tag}[^>]*>`, 'gi');
            sanitized = sanitized.replace(regex, '');
        });
        
        // 2단계: 허용된 태그 처리
        if (allowedTags && Array.isArray(allowedTags)) {
            const allowedPattern = allowedTags.map(tag => `(?:${tag})`).join('|');
            const tagRegex = new RegExp(`<(?!\\/?(?:${allowedPattern})\\b)[^>]*?>`, 'gi');
            sanitized = sanitized.replace(tagRegex, '');
        } else {
            // 모든 HTML 태그 제거
            sanitized = sanitized.replace(/<[^>]*>/g, '');
        }
        
        // 3단계: 위험한 속성 제거
        const dangerousAttrs = [
            'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout',
            'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset',
            'javascript:', 'vbscript:', 'data:', 'about:'
        ];
        
        dangerousAttrs.forEach(attr => {
            const regex = new RegExp(`${attr}[^\\s>]*`, 'gi');
            sanitized = sanitized.replace(regex, '');
        });
        
        // 4단계: XSS 패턴 제거
        const xssPatterns = [
            /javascript\s*:/gi,
            /vbscript\s*:/gi,
            /data\s*:\s*text\/html/gi,
            /&#x?[0-9a-f]+;?/gi, // HTML 엔티티 인코딩 공격
            /%[0-9a-f]{2}/gi,    // URL 인코딩 공격
            /\\u[0-9a-f]{4}/gi,  // 유니코드 인코딩 공격
        ];
        
        xssPatterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '');
        });
        
        // 5단계: 기본 HTML 엔티티 인코딩
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
    
    /**
     * 기본 입력값 새니타이징 (모든 파일의 장점 통합)
     * @param {string} input - 새니타이징할 입력값
     * @param {number} maxLength - 최대 길이
     * @param {object} options - 추가 옵션
     * @returns {string} 새니타이징된 입력값
     */
    static sanitizeInput(input, maxLength = 1000, options = {}) {
        if (typeof input !== 'string') return input;
        
        let sanitized = input.trim();
        
        // 길이 제한
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength);
        }
        
        // HTML 새니타이징 적용
        sanitized = this.sanitizeHtml(sanitized, options);
        
        return sanitized;
    }
    
    /**
     * 보안 위협 감지 시스템
     * @param {string} input - 검사할 입력값
     * @returns {object} 위협 감지 결과
     */
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
            input: input.substring(0, 100) // 로깅용 샘플
        };
    }
}

// ===== 유틸리티 모듈: 안전한 파싱 및 검증 =====
/**
 * 안전한 유틸리티 함수들을 제공하는 클래스
 * 모든 파일의 유틸리티 기능을 통합하고 개선
 */
class SafeUtils {
    /**
     * 고유한 요청 ID를 생성합니다 (개선된 버전)
     * @param {string} prefix - ID 접두사
     * @returns {string} 생성된 요청 ID
     */
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
    
    /**
     * 안전하게 정수를 파싱합니다 (강화된 버전)
     * @param {*} value - 파싱할 값
     * @param {number} defaultValue - 파싱 실패 시 반환할 기본값
     * @param {object} options - 추가 옵션
     * @returns {number} 파싱된 정수 또는 기본값
     */
    static safeParseInt(value, defaultValue = NaN, options = {}) {
        if (value === null || value === undefined || value === '') return defaultValue;
        
        const { min, max, strict = false } = options;
        
        // 보안 검증
        if (typeof value === 'string') {
            const threats = SecurityModule.detectThreats(value);
            if (!threats.safe) {
                console.warn('Security threat detected in parseInt input:', threats);
                return defaultValue;
            }
        }
        
        let num;
        if (strict) {
            // 엄격 모드: 숫자만 허용
            if (!/^-?\d+$/.test(String(value).trim())) {
                return defaultValue;
            }
            num = parseInt(value, 10);
        } else {
            num = parseInt(value, 10);
        }
        
        if (isNaN(num)) return defaultValue;
        
        // 범위 검증
        if (typeof min === 'number' && num < min) return defaultValue;
        if (typeof max === 'number' && num > max) return defaultValue;
        
        return num;
    }
    
    /**
     * 안전하게 부동 소수점을 파싱합니다 (강화된 버전)
     * @param {*} value - 파싱할 값
     * @param {number} defaultValue - 파싱 실패 시 반환할 기본값
     * @param {object} options - 추가 옵션
     * @returns {number} 파싱된 부동 소수점 또는 기본값
     */
    static safeParseFloat(value, defaultValue = NaN, options = {}) {
        if (value === null || value === undefined || value === '') return defaultValue;
        
        const { min, max, precision, strict = false } = options;
        
        // 보안 검증
        if (typeof value === 'string') {
            const threats = SecurityModule.detectThreats(value);
            if (!threats.safe) {
                console.warn('Security threat detected in parseFloat input:', threats);
                return defaultValue;
            }
        }
        
        let num;
        if (strict) {
            // 엄격 모드: 숫자와 소수점만 허용
            if (!/^-?\d*\.?\d+$/.test(String(value).trim())) {
                return defaultValue;
            }
            num = parseFloat(value);
        } else {
            num = parseFloat(value);
        }
        
        if (isNaN(num) || !isFinite(num)) return defaultValue;
        
        // 범위 검증
        if (typeof min === 'number' && num < min) return defaultValue;
        if (typeof max === 'number' && num > max) return defaultValue;
        
        // 정밀도 조정
        if (typeof precision === 'number' && precision >= 0) {
            num = parseFloat(num.toFixed(precision));
        }
        
        return num;
    }
    
    /**
     * 민감한 데이터를 마스킹합니다 (강화된 버전)
     * @param {object} data - 마스킹할 데이터 객체
     * @param {string[]} fieldsToMask - 마스킹할 필드 이름 목록
     * @param {object} options - 마스킹 옵션
     * @returns {object} 마스킹된 데이터 객체
     */
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
    
    /**
     * URL이 유효한 형식인지 확인합니다 (강화된 버전)
     * @param {string} urlString - 확인할 URL 문자열
     * @param {object} options - 검증 옵션
     * @returns {boolean} 유효성 여부
     */
    static isValidUrl(urlString, options = {}) {
        if (typeof urlString !== 'string') return false;
        
        const { allowedProtocols = ['http:', 'https:'], allowLocalhost = false, maxLength = 2048 } = options;
        
        // 길이 검증
        if (urlString.length > maxLength) return false;
        
        // 보안 위협 검증
        const threats = SecurityModule.detectThreats(urlString);
        if (!threats.safe) return false;
        
        try {
            const url = new URL(urlString);
            
            // 프로토콜 검증
            if (!allowedProtocols.includes(url.protocol)) return false;
            
            // localhost 검증
            if (!allowLocalhost && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
                return false;
            }
            
            // 추가 보안 검증
            if (url.username || url.password) return false; // 인증 정보 포함 URL 거부
            
            return true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * 지정된 시간(ms) 동안 대기합니다
     * @param {number} ms - 대기할 시간 (밀리초)
     * @param {object} options - 대기 옵션
     * @returns {Promise<void>}
     */
    static sleep(ms, options = {}) {
        const { maxWait = 30000 } = options;
        const waitTime = Math.min(Math.max(0, ms), maxWait);
        return new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    /**
     * 데이터 검증 및 변환
     * @param {*} data - 검증할 데이터
     * @param {object} schema - 검증 스키마
     * @returns {object} 검증 결과
     */
    static validateAndTransform(data, schema) {
        const errors = [];
        const transformed = {};
        
        for (const [key, rules] of Object.entries(schema)) {
            const value = data[key];
            
            // 필수 필드 검증
            if (rules.required && (value === undefined || value === null || value === '')) {
                errors.push(`Field '${key}' is required`);
                continue;
            }
            
            // 타입 검증 및 변환
            if (value !== undefined && value !== null) {
                try {
                    switch (rules.type) {
                        case 'string':
                            transformed[key] = SecurityModule.sanitizeInput(String(value), rules.maxLength || 1000);
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
/**
 * 지리 관련 유틸리티 함수를 제공하는 클래스 (최적화된 버전)
 */
class GeoUtils {
    /**
     * 좌표가 유효한 범위 내에 있는지 확인합니다 (강화된 버전)
     * @param {number|string} lat - 위도
     * @param {number|string} lng - 경도
     * @param {object} options - 검증 옵션
     * @returns {boolean} 유효성 여부
     */
    static isValidCoordinate(lat, lng, options = {}) {
        const { strict = false, precision = 6 } = options;
        
        const numLat = SafeUtils.safeParseFloat(lat, NaN, { min: -90, max: 90, precision });
        const numLng = SafeUtils.safeParseFloat(lng, NaN, { min: -180, max: 180, precision });
        
        if (isNaN(numLat) || isNaN(numLng)) return false;
        
        // 엄격 모드에서는 더 정밀한 검증
        if (strict) {
            // 한국 영역 검증 (선택적)
            if (options.koreaOnly) {
                return numLat >= 33 && numLat <= 43 && numLng >= 124 && numLng <= 132;
            }
        }
        
        return true;
    }
    
    /**
     * 두 지점 간의 거리를 계산합니다 (최적화된 하버사인 공식)
     * @param {number} lat1 - 첫 번째 지점 위도
     * @param {number} lon1 - 첫 번째 지점 경도
     * @param {number} lat2 - 두 번째 지점 위도
     * @param {number} lon2 - 두 번째 지점 경도
     * @param {string} unit - 거리 단위 ('m', 'km', 'mi')
     * @returns {number} 계산된 거리
     */
    static getDistance(lat1, lon1, lat2, lon2, unit = 'm') {
        // 입력값 검증
        if (!this.isValidCoordinate(lat1, lon1) || !this.isValidCoordinate(lat2, lon2)) {
            return NaN;
        }
        
        const R = 6371e3; // 지구 반지름 (미터)
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;
        
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        let distance = R * c; // 미터 단위
        
        // 단위 변환
        switch (unit.toLowerCase()) {
            case 'km':
                distance = distance / 1000;
                break;
            case 'mi':
                distance = distance / 1609.344;
                break;
            case 'm':
            default:
                // 미터 단위 유지
                break;
        }
        
        return Math.round(distance * 100) / 100; // 소수점 2자리까지
    }
    
    /**
     * 아이템 목록에 거리 정보를 추가하고 필터링합니다 (성능 최적화)
     * @param {Array<object>} items - 관광지 아이템 목록
     * @param {number|string} userLat - 사용자 위도
     * @param {number|string} userLng - 사용자 경도
     * @param {number|string} radius - 필터링할 반경 (미터)
     * @param {object} options - 추가 옵션
     * @returns {Array<object>} 처리된 아이템 목록
     */
    static addDistanceInfo(items, userLat, userLng, radius, options = {}) {
        if (!Array.isArray(items)) return [];
        
        const { unit = 'm', sortByDistance = true, maxResults = 1000 } = options;
        const lat = SafeUtils.safeParseFloat(userLat);
        const lng = SafeUtils.safeParseFloat(userLng);
        const rad = SafeUtils.safeParseFloat(radius);
        
        if (isNaN(lat) || isNaN(lng)) {
            return items.slice(0, maxResults); // 사용자 좌표가 유효하지 않으면 원본 반환
        }
        
        // 거리 계산 및 필터링
        const processedItems = items
            .map(item => {
                const itemLat = SafeUtils.safeParseFloat(item.mapy); // mapy가 위도
                const itemLng = SafeUtils.safeParseFloat(item.mapx); // mapx가 경도
                
                if (!isNaN(itemLat) && !isNaN(itemLng)) {
                    const distance = this.getDistance(lat, lng, itemLat, itemLng, unit);
                    return { ...item, distance };
                }
                return item;
            })
            .filter(item => {
                // radius가 유효하지 않거나 0 이하면 필터링 안 함
                if (isNaN(rad) || rad <= 0) return true;
                return item.distance !== undefined && item.distance <= rad;
            });
        
        // 정렬
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
    
    /**
     * 지역 경계 내에 있는지 확인합니다
     * @param {number} lat - 위도
     * @param {number} lng - 경도
     * @param {object} bounds - 경계 정보
     * @returns {boolean} 경계 내 포함 여부
     */
    static isWithinBounds(lat, lng, bounds) {
        if (!this.isValidCoordinate(lat, lng)) return false;
        if (!bounds || typeof bounds !== 'object') return true;
        
        const { north, south, east, west } = bounds;
        
        return lat >= south && lat <= north && lng >= west && lng <= east;
    }
}

// ===== 에러 처리 모듈 =====
/**
 * 모든 사용자 정의 에러의 기본 클래스 (강화된 버전)
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
        this.requestId = SafeUtils.generateRequestId('err');
        
        // 국제화 메시지 처리
        if (this.i18n && typeof this.i18n.getMessage === 'function') {
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
     * 에러 객체를 JSON 형식으로 직렬화합니다
     * @param {boolean} includeStack - 스택 트레이스 포함 여부
     * @returns {object} JSON 형식의 에러 객체
     */
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
    
    /**
     * 로깅용 안전한 에러 정보 반환
     * @returns {object} 로깅용 에러 정보
     */
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

/**
 * 관광 API 관련 특정 에러 클래스 (강화된 버전)
 */
class TourismApiError extends BaseError {
    constructor(code = 'API_ERROR', operation = 'unknown', statusCode = 500, details = {}, metadata = {}, i18n = null) {
        const message = i18n && typeof i18n.getMessage === 'function' 
            ? i18n.getMessage(code, { operation, ...details }) 
            : `Tourism API error during ${operation}`;
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

/**
 * 입력값 유효성 검사 에러 클래스 (강화된 버전)
 */
class ValidationError extends BaseError {
    constructor(message, field = 'unknown', value = 'unknown', i18n = null) {
        const localizedMessage = i18n && typeof i18n.getMessage === 'function'
            ? i18n.getMessage('VALIDATION_ERROR_FIELD', { field, value, message })
            : `Validation error for field '${field}': ${message}`;
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

/**
 * API 요청 시간 초과 에러 클래스
 */
class ApiTimeoutError extends BaseError {
    constructor(timeout, operation = 'unknown', i18n = null) {
        const message = i18n && typeof i18n.getMessage === 'function'
            ? i18n.getMessage('API_TIMEOUT', { timeout, operation })
            : `API request timed out after ${timeout}ms for operation '${operation}'.`;
        super(message, 'API_TIMEOUT', 504, { timeout, operation }, i18n);
        this.timeout = timeout;
        this.operation = operation;
    }
}

/**
 * API 요청 한도 초과 에러 클래스
 */
class RateLimitError extends BaseError {
    constructor(limit, remaining, resetTime, i18n = null) {
        const message = i18n && typeof i18n.getMessage === 'function'
            ? i18n.getMessage('RATE_LIMIT_EXCEEDED', { limit, remaining, resetTime })
            : `Rate limit exceeded. Limit: ${limit}, Remaining: ${remaining}.`;
        super(message, 'RATE_LIMIT_EXCEEDED', 429, { limit, remaining, resetTime }, i18n);
        this.limit = limit;
        this.remaining = remaining;
        this.resetTime = resetTime;
    }
}

/**
 * 보안 관련 에러 클래스 (강화된 버전)
 */
class SecurityError extends BaseError {
    constructor(message = 'Security threat detected', code = 'SECURITY_ERROR', details = {}, i18n = null) {
        const localizedMessage = i18n && typeof i18n.getMessage === 'function'
            ? i18n.getMessage(code, details)
            : message;
        super(localizedMessage, code, 403, details, i18n);
        this.securityLevel = details.level || 'medium';
    }
}

/**
 * 네트워크 관련 에러 클래스
 */
class NetworkError extends BaseError {
    constructor(message, code = 'NETWORK_ERROR', statusCode = 500, details = {}, i18n = null) {
        super(message, code, statusCode, details, i18n);
        this.isNetworkError = true;
    }
}

// ===== 응답 포맷터 모듈 =====
/**
 * API 응답을 일관된 형식으로 포맷팅하는 클래스 (강화된 버전)
 */
class ResponseFormatter {
    /**
     * 성공 응답을 포맷합니다
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
            metadata: {
                ...metadata,
                version: '1.0.0',
                environment: NODE_ENV ? 'node' : 'browser',
                securityStatus: securityLibraryStatus
            },
            performance: {
                ...performance,
                responseTime: performance.responseTime || (Date.now() - SERVICE_START_TIME)
            }
        };
    }
    
    /**
     * 에러 응답을 포맷합니다 (강화된 버전)
     * @param {Error|BaseError} error - 에러 객체
     * @param {string} operation - 에러가 발생한 작업명
     * @param {object} context - 추가 컨텍스트 정보
     * @returns {object} 포맷된 에러 응답
     */
    static formatError(error, operation = 'unknown', context = {}) {
        if (error instanceof BaseError) {
            const errorJson = error.toJSON();
            if (operation && !errorJson.error.operation) {
                errorJson.error.operation = operation;
            }
            
            // 컨텍스트 정보 추가
            if (Object.keys(context).length > 0) {
                errorJson.context = SafeUtils.maskSensitiveData(context);
            }
            
            return errorJson;
        }
        
        // 알 수 없는 에러에 대한 처리
        const i18n = error.i18n;
        const message = i18n && typeof i18n.getMessage === 'function'
            ? i18n.getMessage('UNKNOWN_ERROR')
            : 'An unexpected error occurred.';
        
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
    
    /**
     * 응답 데이터에 캐시 정보를 추가합니다
     * @param {object} data - 원본 응답 데이터
     * @param {boolean} isCached - 캐시 사용 여부
     * @param {object} cacheStats - 캐시 통계 정보
     * @returns {object} 캐시 정보가 추가된 응답 데이터
     */
    static addCacheInfo(data, isCached, cacheStats = {}) {
        if (typeof data === 'object' && data !== null) {
            data.metadata = {
                ...data.metadata,
                cache: {
                    isCached,
                    hitRate: cacheStats.hitRate || 0,
                    size: cacheStats.size || 0,
                    lastCleanup: cacheStats.lastCleanup || null,
                    ...(isCached ? cacheStats : {})
                }
            };
        }
        return data;
    }
    
    /**
     * 페이지네이션 정보를 추가합니다
     * @param {object} data - 응답 데이터
     * @param {object} pagination - 페이지네이션 정보
     * @returns {object} 페이지네이션 정보가 추가된 응답 데이터
     */
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

// 계속해서 나머지 모듈들을 작성하겠습니다...


// ===== 서비스 컨테이너 모듈 =====
/**
 * 의존성 주입을 관리하는 서비스 컨테이너 (강화된 버전)
 */
class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.instances = new Map();
        this.initialized = false;
        this.initializationTime = null;
        this.dependencies = new Map();
    }
    
    /**
     * 서비스를 컨테이너에 등록합니다
     * @param {string} name - 서비스 이름
     * @param {function} factory - 서비스 인스턴스를 생성하는 팩토리 함수
     * @param {object} options - 등록 옵션
     * @returns {ServiceContainer} 현재 컨테이너 인스턴스 (체이닝용)
     */
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
    
    /**
     * 서비스 인스턴스를 가져옵니다
     * @param {string} name - 가져올 서비스 이름
     * @returns {object} 서비스 인스턴스
     * @throws {Error} 서비스가 등록되지 않은 경우
     */
    get(name) {
        if (!this.services.has(name)) {
            throw new Error(`Service '${name}' not found. Available services: ${Array.from(this.services.keys()).join(', ')}`);
        }
        
        const serviceConfig = this.services.get(name);
        
        // 싱글턴 패턴 적용
        if (serviceConfig.singleton && this.instances.has(name)) {
            return this.instances.get(name);
        }
        
        // 의존성 해결
        const resolvedDependencies = {};
        for (const dep of serviceConfig.dependencies) {
            resolvedDependencies[dep] = this.get(dep);
        }
        
        // 인스턴스 생성
        const instance = serviceConfig.factory(this, resolvedDependencies);
        
        if (serviceConfig.singleton) {
            this.instances.set(name, instance);
        }
        
        return instance;
    }
    
    /**
     * 등록된 모든 서비스를 초기화합니다
     */
    initialize() {
        if (this.initialized) return;
        
        const startTime = Date.now();
        
        try {
            // 의존성 순서대로 초기화
            const initOrder = this.resolveDependencyOrder();
            
            for (const serviceName of initOrder) {
                this.get(serviceName);
            }
            
            this.initialized = true;
            this.initializationTime = Date.now() - startTime;
            
            console.log(`Service container initialized in ${this.initializationTime}ms with services:`, 
                       Array.from(this.instances.keys()).join(', '));
        } catch (error) {
            console.error('Service container initialization failed:', error);
            throw new Error(`Service container initialization failed: ${error.message}`);
        }
    }
    
    /**
     * 의존성 순서를 해결합니다 (토폴로지 정렬)
     * @returns {string[]} 초기화 순서
     */
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
    
    /**
     * 컨테이너가 초기화되었는지 여부를 반환합니다
     * @returns {boolean} 초기화 여부
     */
    isInitialized() {
        return this.initialized;
    }
    
    /**
     * 현재 인스턴스화된 서비스들의 목록을 반환합니다
     * @returns {string[]} 인스턴스화된 서비스 이름 목록
     */
    getInstancedServices() {
        return Array.from(this.instances.keys());
    }
    
    /**
     * 서비스 컨테이너를 정리하고 모든 인스턴스를 해제합니다
     */
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
    
    /**
     * 컨테이너 상태 정보를 반환합니다
     * @returns {object} 상태 정보
     */
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
/**
 * 다국어 메시지를 관리하는 클래스 (강화된 버전)
 */
class InternationalizationManager {
    constructor(defaultLanguage = 'ko') {
        this.currentLanguage = defaultLanguage;
        this.fallbackLanguage = 'en';
        this.messages = this.initializeMessages();
        this.customMessages = new Map();
    }
    
    /**
     * 기본 메시지를 초기화합니다
     * @returns {object} 초기화된 메시지 객체
     */
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
    
    /**
     * 현재 언어를 설정합니다
     * @param {string} language - 설정할 언어 코드
     */
    setLanguage(language) {
        if (typeof language === 'string' && this.messages[language]) {
            this.currentLanguage = language;
        } else {
            console.warn(`Language '${language}' not supported. Using default: ${this.currentLanguage}`);
        }
    }
    
    /**
     * 메시지를 가져옵니다
     * @param {string} key - 메시지 키
     * @param {object} params - 메시지 파라미터
     * @param {string} language - 사용할 언어 (선택적)
     * @returns {string} 번역된 메시지
     */
    getMessage(key, params = {}, language = null) {
        const lang = language || this.currentLanguage;
        
        // 커스텀 메시지 확인
        const customKey = `${lang}:${key}`;
        if (this.customMessages.has(customKey)) {
            return this.interpolate(this.customMessages.get(customKey), params);
        }
        
        // 기본 메시지 확인
        let message = this.messages[lang]?.[key];
        
        // Fallback 언어 확인
        if (!message && lang !== this.fallbackLanguage) {
            message = this.messages[this.fallbackLanguage]?.[key];
        }
        
        // 최종 Fallback
        if (!message) {
            message = key;
            console.warn(`Message not found for key '${key}' in language '${lang}'`);
        }
        
        return this.interpolate(message, params);
    }
    
    /**
     * 메시지에 파라미터를 보간합니다
     * @param {string} message - 원본 메시지
     * @param {object} params - 보간할 파라미터
     * @returns {string} 보간된 메시지
     */
    interpolate(message, params) {
        if (!params || typeof params !== 'object') return message;
        
        return message.replace(/\$\{([^}]+)\}/g, (match, key) => {
            const value = params[key];
            return value !== undefined ? String(value) : match;
        });
    }
    
    /**
     * 커스텀 메시지를 추가합니다
     * @param {string} language - 언어 코드
     * @param {string} key - 메시지 키
     * @param {string} message - 메시지 내용
     */
    addCustomMessage(language, key, message) {
        const customKey = `${language}:${key}`;
        this.customMessages.set(customKey, message);
    }
    
    /**
     * 지원되는 언어 목록을 반환합니다
     * @returns {string[]} 지원 언어 목록
     */
    getSupportedLanguages() {
        return Object.keys(this.messages);
    }
    
    /**
     * 현재 언어를 반환합니다
     * @returns {string} 현재 언어 코드
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }
}

// ===== 캐시 모듈 =====
/**
 * 고급 캐시 시스템 (Lazy Cleanup 방식, 메모리 최적화)
 */
class AdvancedCache {
    constructor(options = {}) {
        this.cache = new Map();
        this.accessTimes = new Map();
        this.hitCount = 0;
        this.missCount = 0;
        this.lastCleanup = Date.now();
        
        // 설정 옵션
        this.maxSize = options.maxSize || 1000;
        this.defaultTTL = options.defaultTTL || 300000; // 5분
        this.cleanupThreshold = options.cleanupThreshold || 100; // 100개 항목마다 정리
        this.maxMemoryUsage = options.maxMemoryUsage || 50 * 1024 * 1024; // 50MB
        this.accessCountThreshold = options.accessCountThreshold || 50;
        
        this.operationCount = 0;
    }
    
    /**
     * 캐시에서 값을 가져옵니다
     * @param {string} key - 캐시 키
     * @returns {*} 캐시된 값 또는 undefined
     */
    get(key) {
        this.operationCount++;
        
        // Lazy Cleanup 실행
        if (this.operationCount % this.accessCountThreshold === 0) {
            this.lazyCleanup();
        }
        
        const item = this.cache.get(key);
        
        if (!item) {
            this.missCount++;
            return undefined;
        }
        
        // TTL 확인
        if (item.expiry && Date.now() > item.expiry) {
            this.cache.delete(key);
            this.accessTimes.delete(key);
            this.missCount++;
            return undefined;
        }
        
        // 접근 시간 업데이트
        this.accessTimes.set(key, Date.now());
        this.hitCount++;
        
        return item.value;
    }
    
    /**
     * 캐시에 값을 저장합니다
     * @param {string} key - 캐시 키
     * @param {*} value - 저장할 값
     * @param {number} ttl - TTL (밀리초)
     */
    set(key, value, ttl = null) {
        const expiry = ttl ? Date.now() + ttl : Date.now() + this.defaultTTL;
        
        // 메모리 사용량 확인
        if (this.getEstimatedMemoryUsage() > this.maxMemoryUsage) {
            this.evictLeastRecentlyUsed();
        }
        
        // 최대 크기 확인
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLeastRecentlyUsed();
        }
        
        this.cache.set(key, { value, expiry, createdAt: Date.now() });
        this.accessTimes.set(key, Date.now());
    }
    
    /**
     * 캐시에서 키를 삭제합니다
     * @param {string} key - 삭제할 키
     * @returns {boolean} 삭제 성공 여부
     */
    delete(key) {
        const deleted = this.cache.delete(key);
        this.accessTimes.delete(key);
        return deleted;
    }
    
    /**
     * 캐시를 완전히 비웁니다
     */
    clear() {
        this.cache.clear();
        this.accessTimes.clear();
        this.hitCount = 0;
        this.missCount = 0;
        this.operationCount = 0;
        this.lastCleanup = Date.now();
    }
    
    /**
     * Lazy Cleanup 실행 (만료된 항목 제거)
     */
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
    
    /**
     * LRU 방식으로 항목을 제거합니다
     */
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
    
    /**
     * 캐시 통계를 반환합니다
     * @returns {object} 캐시 통계 정보
     */
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
    
    /**
     * 추정 메모리 사용량을 계산합니다
     * @returns {number} 추정 메모리 사용량 (바이트)
     */
    getEstimatedMemoryUsage() {
        let totalSize = 0;
        
        for (const [key, item] of this.cache.entries()) {
            totalSize += this.getObjectSize(key) + this.getObjectSize(item);
        }
        
        return totalSize;
    }
    
    /**
     * 객체의 추정 크기를 계산합니다
     * @param {*} obj - 크기를 계산할 객체
     * @returns {number} 추정 크기 (바이트)
     */
    getObjectSize(obj) {
        if (obj === null || obj === undefined) return 0;
        
        switch (typeof obj) {
            case 'string':
                return obj.length * 2; // UTF-16
            case 'number':
                return 8;
            case 'boolean':
                return 4;
            case 'object':
                if (Array.isArray(obj)) {
                    return obj.reduce((size, item) => size + this.getObjectSize(item), 0);
                }
                return Object.entries(obj).reduce((size, [key, value]) => 
                    size + this.getObjectSize(key) + this.getObjectSize(value), 0);
            default:
                return 0;
        }
    }
    
    /**
     * 캐시 최적화를 수행합니다
     */
    optimize() {
        this.lazyCleanup();
        
        // 메모리 사용량이 임계값을 초과하면 LRU 제거
        while (this.getEstimatedMemoryUsage() > this.maxMemoryUsage && this.cache.size > 0) {
            this.evictLeastRecentlyUsed();
        }
        
        console.log('Cache optimization completed:', this.getStats());
    }
    
    /**
     * 캐시 인스턴스를 정리합니다
     */
    destroy() {
        this.clear();
        console.log('Cache instance destroyed');
    }
}

// ===== Rate Limiter 모듈 =====
/**
 * 요청 제한 관리자 (Lazy Cleanup 방식)
 */
class RateLimiter {
    constructor(options = {}) {
        this.requests = new Map();
        this.windowSize = options.windowSize || 60000; // 1분
        this.maxRequests = options.maxRequests || 100;
        this.cleanupThreshold = options.cleanupThreshold || 50;
        this.operationCount = 0;
    }
    
    /**
     * 요청 제한을 확인합니다
     * @param {string} identifier - 요청자 식별자 (IP, API 키 등)
     * @returns {object} 제한 확인 결과
     */
    checkLimit(identifier) {
        this.operationCount++;
        
        // Lazy Cleanup 실행
        if (this.operationCount % this.cleanupThreshold === 0) {
            this.lazyCleanup();
        }
        
        const now = Date.now();
        const windowStart = now - this.windowSize;
        
        if (!this.requests.has(identifier)) {
            this.requests.set(identifier, []);
        }
        
        const userRequests = this.requests.get(identifier);
        
        // 윈도우 범위 내의 요청만 유지
        const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
        this.requests.set(identifier, validRequests);
        
        // 제한 확인
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
        
        // 요청 기록
        validRequests.push(now);
        
        return {
            allowed: true,
            limit: this.maxRequests,
            remaining: this.maxRequests - validRequests.length,
            resetTime: new Date(now + this.windowSize).toISOString(),
            retryAfter: 0
        };
    }
    
    /**
     * Lazy Cleanup 실행 (만료된 요청 기록 제거)
     */
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
    
    /**
     * 특정 식별자의 제한을 초기화합니다
     * @param {string} identifier - 초기화할 식별자
     */
    reset(identifier) {
        this.requests.delete(identifier);
    }
    
    /**
     * 모든 제한을 초기화합니다
     */
    clear() {
        this.requests.clear();
        this.operationCount = 0;
    }
    
    /**
     * Rate Limiter 통계를 반환합니다
     * @returns {object} 통계 정보
     */
    getStats() {
        return {
            activeIdentifiers: this.requests.size,
            windowSize: this.windowSize,
            maxRequests: this.maxRequests,
            operationCount: this.operationCount
        };
    }
    
    /**
     * Rate Limiter 인스턴스를 정리합니다
     */
    destroy() {
        this.clear();
        console.log('Rate limiter destroyed');
    }
}


// ===== HTTP 클라이언트 모듈 =====
/**
 * HTTP 요청을 처리하는 클라이언트 (강화된 버전)
 */
class HttpClient {
    constructor(options = {}) {
        this.baseURL = options.baseURL || '';
        this.timeout = options.timeout || 30000;
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.defaultHeaders = options.defaultHeaders || {};
        this.rateLimiter = options.rateLimiter || null;
    }
    
    /**
     * HTTP GET 요청을 수행합니다
     * @param {string} url - 요청 URL
     * @param {object} options - 요청 옵션
     * @returns {Promise<object>} 응답 데이터
     */
    async get(url, options = {}) {
        return this.request('GET', url, null, options);
    }
    
    /**
     * HTTP POST 요청을 수행합니다
     * @param {string} url - 요청 URL
     * @param {object} data - 요청 데이터
     * @param {object} options - 요청 옵션
     * @returns {Promise<object>} 응답 데이터
     */
    async post(url, data, options = {}) {
        return this.request('POST', url, data, options);
    }
    
    /**
     * HTTP 요청을 수행합니다 (재시도 로직 포함)
     * @param {string} method - HTTP 메서드
     * @param {string} url - 요청 URL
     * @param {object} data - 요청 데이터
     * @param {object} options - 요청 옵션
     * @returns {Promise<object>} 응답 데이터
     */
    async request(method, url, data = null, options = {}) {
        const fullUrl = this.baseURL + url;
        const requestOptions = this.buildRequestOptions(method, data, options);
        
        // Rate Limiting 확인
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
                
                // 재시도하지 않을 에러들
                if (error instanceof ValidationError || 
                    error instanceof SecurityError ||
                    (error.statusCode && error.statusCode >= 400 && error.statusCode < 500)) {
                    throw error;
                }
                
                // 마지막 시도가 아니면 재시도
                if (attempt < this.retryAttempts) {
                    const delay = this.retryDelay * Math.pow(2, attempt - 1); // 지수 백오프
                    console.warn(`Request failed (attempt ${attempt}/${this.retryAttempts}), retrying in ${delay}ms:`, error.message);
                    await SafeUtils.sleep(delay);
                }
            }
        }
        
        throw new NetworkError(`Request failed after ${this.retryAttempts} attempts: ${lastError.message}`, 'REQUEST_FAILED', 500, {
            url: fullUrl,
            method,
            attempts: this.retryAttempts,
            lastError: lastError.message
        });
    }
    
    /**
     * 요청 옵션을 구성합니다
     * @param {string} method - HTTP 메서드
     * @param {object} data - 요청 데이터
     * @param {object} options - 추가 옵션
     * @returns {object} 구성된 요청 옵션
     */
    buildRequestOptions(method, data, options) {
        const requestOptions = {
            method,
            headers: {
                ...this.defaultHeaders,
                ...options.headers
            },
            timeout: options.timeout || this.timeout
        };
        
        if (data) {
            if (method === 'GET') {
                // GET 요청의 경우 쿼리 파라미터로 변환
                // 이 경우는 일반적이지 않으므로 경고
                console.warn('Data provided for GET request, consider using query parameters');
            } else {
                requestOptions.body = JSON.stringify(data);
                requestOptions.headers['Content-Type'] = 'application/json';
            }
        }
        
        return requestOptions;
    }
    
    /**
     * 실제 HTTP 요청을 수행합니다
     * @param {string} url - 요청 URL
     * @param {object} options - 요청 옵션
     * @returns {Promise<Response>} HTTP 응답
     */
    async performRequest(url, options) {
        // 보안 검증
        if (!SafeUtils.isValidUrl(url)) {
            throw new SecurityError('Invalid URL detected', 'INVALID_URL', { url });
        }
        
        // 타임아웃 처리
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new ApiTimeoutError(options.timeout, 'HTTP_REQUEST');
            }
            
            throw new NetworkError(`Network request failed: ${error.message}`, 'NETWORK_ERROR', 0, {
                url,
                error: error.message
            });
        }
    }
    
    /**
     * HTTP 응답을 처리합니다
     * @param {Response} response - HTTP 응답
     * @returns {Promise<object>} 처리된 응답 데이터
     */
    async processResponse(response) {
        if (!response.ok) {
            let errorMessage = `HTTP ${response.status} ${response.statusText}`;
            let errorDetails = {
                status: response.status,
                statusText: response.statusText,
                url: response.url
            };
            
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
                throw new NetworkError('Invalid JSON response', 'INVALID_JSON', 500, {
                    contentType,
                    error: error.message
                });
            }
        } else if (contentType && contentType.includes('text/')) {
            return await response.text();
        } else {
            return await response.arrayBuffer();
        }
    }
}

// ===== 관광 API 클라이언트 모듈 =====
/**
 * 한국관광공사 API 클라이언트 (완전 통합 버전)
 */
class TourismApiClient {
    constructor(options = {}) {
        this.apiKey = options.apiKey || this.getApiKeyFromEnv();
        this.baseURL = options.baseURL || 'http://apis.data.go.kr/B551011/KorService2';
        this.httpClient = new HttpClient({
            baseURL: this.baseURL,
            timeout: options.timeout || 30000,
            retryAttempts: options.retryAttempts || 3,
            rateLimiter: options.rateLimiter
        });
        this.cache = options.cache || null;
        this.i18n = options.i18n || new InternationalizationManager();
        this.batchEnabled = options.batchEnabled !== false;
        this.maxBatchSize = options.maxBatchSize || 10;
    }
    
    /**
     * 환경변수에서 API 키를 가져옵니다
     * @returns {string} API 키
     */
    getApiKeyFromEnv() {
        if (NODE_ENV && process.env.TOURISM_API_KEY) {
            return process.env.TOURISM_API_KEY;
        }
        throw new TourismApiError('MISSING_API_KEY', 'initialization', 500, {}, {}, this.i18n);
    }
    
    /**
     * 기본 요청 파라미터를 구성합니다
     * @param {object} params - 추가 파라미터
     * @returns {object} 구성된 파라미터
     */
    buildBaseParams(params = {}) {
        return {
            serviceKey: this.apiKey,
            MobileOS: 'ETC',
            MobileApp: 'TourismAPI',
            _type: 'json',
            ...params
        };
    }
    
    /**
     * URL과 쿼리 파라미터를 구성합니다
     * @param {string} endpoint - API 엔드포인트
     * @param {object} params - 쿼리 파라미터
     * @returns {string} 완성된 URL
     */
    buildUrl(endpoint, params) {
        const queryParams = new URLSearchParams();
        
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, String(value));
            }
        });
        
        return `${endpoint}?${queryParams.toString()}`;
    }
    
    /**
     * 캐시 키를 생성합니다
     * @param {string} operation - 작업명
     * @param {object} params - 파라미터
     * @returns {string} 캐시 키
     */
    generateCacheKey(operation, params) {
        const sortedParams = Object.keys(params).sort().reduce((result, key) => {
            result[key] = params[key];
            return result;
        }, {});
        
        return `tourism_api:${operation}:${JSON.stringify(sortedParams)}`;
    }
    
    /**
     * API 요청을 수행합니다
     * @param {string} endpoint - API 엔드포인트
     * @param {object} params - 요청 파라미터
     * @param {object} options - 추가 옵션
     * @returns {Promise<object>} API 응답
     */
    async makeRequest(endpoint, params = {}, options = {}) {
        const operation = options.operation || endpoint;
        const startTime = Date.now();
        
        try {
            // 파라미터 검증 및 새니타이징
            const validatedParams = this.validateAndSanitizeParams(params);
            const fullParams = this.buildBaseParams(validatedParams);
            
            // 캐시 확인
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
            
            // API 요청 수행
            const url = this.buildUrl(endpoint, fullParams);
            const response = await this.httpClient.get(url, {
                identifier: options.identifier || 'default'
            });
            
            // 응답 처리
            const processedResponse = this.processApiResponse(response, operation);
            
            // 캐시 저장
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
    
    /**
     * 파라미터를 검증하고 새니타이징합니다
     * @param {object} params - 검증할 파라미터
     * @returns {object} 검증된 파라미터
     */
    validateAndSanitizeParams(params) {
        const sanitized = {};
        
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                if (typeof value === 'string') {
                    // 보안 위협 검사
                    const threats = SecurityModule.detectThreats(value);
                    if (!threats.safe) {
                        throw new SecurityError(
                            `Security threat detected in parameter '${key}'`,
                            'PARAMETER_THREAT',
                            { key, threats: threats.threats }
                        );
                    }
                    
                    // 새니타이징
                    sanitized[key] = SecurityModule.sanitizeInput(value, 1000);
                } else {
                    sanitized[key] = value;
                }
            }
        });
        
        return sanitized;
    }
    
    /**
     * API 응답을 처리합니다
     * @param {object} response - 원본 API 응답
     * @param {string} operation - 작업명
     * @returns {object} 처리된 응답
     */
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
        
        // API 에러 코드 확인
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
            
            // 데이터 추출
            if (apiResponse.body) {
                return apiResponse.body;
            }
        }
        
        return response;
    }
    
    /**
     * API 에러 코드를 내부 에러 코드로 매핑합니다
     * @param {string} apiErrorCode - API 에러 코드
     * @returns {string} 매핑된 에러 코드
     */
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
    
    /**
     * 지역 기반 관광정보 조회
     * @param {object} params - 조회 파라미터
     * @returns {Promise<object>} 관광정보 목록
     */
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
        
        return this.makeRequest('/areaBasedList1', validation.data, {
            operation: 'areaBasedList',
            useCache: true,
            cacheTTL: 300000 // 5분
        });
    }
    
    /**
     * 관광정보 상세 조회
     * @param {object} params - 조회 파라미터
     * @returns {Promise<object>} 상세 정보
     */
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
        
        return this.makeRequest('/detailCommon1', validation.data, {
            operation: 'detailCommon',
            useCache: true,
            cacheTTL: 600000 // 10분
        });
    }
    
    /**
     * 키워드 검색
     * @param {object} params - 검색 파라미터
     * @returns {Promise<object>} 검색 결과
     */
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
        
        return this.makeRequest('/searchKeyword1', validation.data, {
            operation: 'searchKeyword',
            useCache: true,
            cacheTTL: 180000 // 3분
        });
    }
    
    /**
     * 위치 기반 관광정보 조회
     * @param {object} params - 조회 파라미터
     * @returns {Promise<object>} 위치 기반 관광정보
     */
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
        
        // 좌표 유효성 추가 검증
        if (!GeoUtils.isValidCoordinate(validation.data.mapY, validation.data.mapX, { koreaOnly: true })) {
            throw new ValidationError(
                this.i18n.getMessage('INVALID_COORDINATES', { 
                    lat: validation.data.mapY, 
                    lng: validation.data.mapX 
                }),
                'coordinates',
                { mapX: validation.data.mapX, mapY: validation.data.mapY },
                this.i18n
            );
        }
        
        return this.makeRequest('/locationBasedList1', validation.data, {
            operation: 'locationBasedList',
            useCache: true,
            cacheTTL: 300000 // 5분
        });
    }
    
    /**
     * 배치 요청 처리
     * @param {Array} requests - 요청 목록
     * @param {object} options - 배치 옵션
     * @returns {Promise<Array>} 배치 처리 결과
     */
    async batchRequest(requests, options = {}) {
        if (!this.batchEnabled) {
            throw new TourismApiError('BATCH_DISABLED', 'batchRequest', 400, {}, {}, this.i18n);
        }
        
        if (!Array.isArray(requests) || requests.length === 0) {
            throw new ValidationError('Requests must be a non-empty array', 'requests', requests, this.i18n);
        }
        
        if (requests.length > this.maxBatchSize) {
            throw new ValidationError(
                this.i18n.getMessage('BATCH_SIZE_EXCEEDED', { 
                    max: this.maxBatchSize, 
                    actual: requests.length 
                }),
                'requests',
                requests.length,
                this.i18n
            );
        }
        
        const { concurrency = 3, failFast = false } = options;
        const results = [];
        
        // 동시성 제어를 위한 배치 처리
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
    
    /**
     * 클라이언트 인스턴스를 정리합니다
     */
    destroy() {
        if (this.cache && typeof this.cache.destroy === 'function') {
            this.cache.destroy();
        }
        console.log('Tourism API client destroyed');
    }
}

// ===== 메인 핸들러 =====
/**
 * 서버리스 함수의 메인 핸들러 (완전 통합 버전)
 */
class TourismApiHandler {
    constructor() {
        this.container = new ServiceContainer();
        this.initialized = false;
        this.initializeServices();
    }
    
    /**
     * 서비스들을 초기화합니다
     */
    initializeServices() {
        // 국제화 관리자
        this.container.register('i18n', () => new InternationalizationManager());
        
        // 캐시 시스템
        this.container.register('cache', () => new AdvancedCache({
            maxSize: 1000,
            defaultTTL: 300000,
            maxMemoryUsage: 50 * 1024 * 1024
        }));
        
        // Rate Limiter
        this.container.register('rateLimiter', () => new RateLimiter({
            windowSize: 60000,
            maxRequests: 100
        }));
        
        // Tourism API 클라이언트
        this.container.register('apiClient', (container) => new TourismApiClient({
            cache: container.get('cache'),
            rateLimiter: container.get('rateLimiter'),
            i18n: container.get('i18n')
        }), { dependencies: ['cache', 'rateLimiter', 'i18n'] });
        
        this.container.initialize();
        this.initialized = true;
    }
    
    /**
     * 메인 핸들러 함수
     * @param {object} event - 이벤트 객체
     * @param {object} context - 컨텍스트 객체
     * @returns {Promise<object>} 응답 객체
     */
    async handle(event, context = {}) {
        const requestId = SafeUtils.generateRequestId('req');
        const startTime = Date.now();
        
        try {
            // 초기화 확인
            if (!this.initialized) {
                this.initializeServices();
            }
            
            // 요청 파싱
            const request = this.parseRequest(event);
            
            // 보안 검증
            this.validateSecurity(request);
            
            // 요청 라우팅
            const result = await this.routeRequest(request, { requestId });
            
            // 성공 응답
            const responseTime = Date.now() - startTime;
            return this.formatResponse(200, result, { requestId, responseTime });
            
        } catch (error) {
            const responseTime = Date.now() - startTime;
            console.error('Handler error:', error);
            
            return this.formatErrorResponse(error, { requestId, responseTime });
        }
    }
    
    /**
     * 요청을 파싱합니다
     * @param {object} event - 이벤트 객체
     * @returns {object} 파싱된 요청
     */
    parseRequest(event) {
        const request = {
            method: 'GET',
            path: '/',
            query: {},
            body: null,
            headers: {},
            ip: 'unknown'
        };
        
        // AWS Lambda 이벤트 처리
        if (event.httpMethod) {
            request.method = event.httpMethod;
            request.path = event.path || '/';
            request.query = event.queryStringParameters || {};
            request.headers = event.headers || {};
            request.ip = event.requestContext?.identity?.sourceIp || 'unknown';
            
            if (event.body) {
                try {
                    request.body = JSON.parse(event.body);
                } catch (error) {
                    request.body = event.body;
                }
            }
        }
        // Vercel 이벤트 처리
        else if (event.query) {
            request.query = event.query;
            request.headers = event.headers || {};
        }
        // 직접 호출 처리
        else {
            request.query = event;
        }
        
        return request;
    }
    
    /**
     * 보안 검증을 수행합니다
     * @param {object} request - 요청 객체
     */
    validateSecurity(request) {
        // IP 기반 검증 (필요시)
        if (request.ip && request.ip !== 'unknown') {
            // IP 화이트리스트 검증 로직 (선택적)
        }
        
        // 요청 크기 검증
        const requestSize = JSON.stringify(request).length;
        if (requestSize > 1024 * 1024) { // 1MB
            throw new SecurityError('Request too large', 'REQUEST_TOO_LARGE', { size: requestSize });
        }
        
        // 쿼리 파라미터 보안 검증
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
    
    /**
     * 요청을 라우팅합니다
     * @param {object} request - 요청 객체
     * @param {object} context - 컨텍스트
     * @returns {Promise<object>} 처리 결과
     */
    async routeRequest(request, context) {
        const apiClient = this.container.get('apiClient');
        const operation = request.query.operation || request.path.substring(1) || 'areaBasedList';
        
        // 지원되는 작업 목록
        const supportedOperations = [
            'areaBasedList',
            'detailCommon',
            'searchKeyword',
            'locationBasedList',
            'batchRequest'
        ];
        
        if (!supportedOperations.includes(operation)) {
            throw new ValidationError(
                `Unsupported operation: ${operation}. Supported: ${supportedOperations.join(', ')}`,
                'operation',
                operation,
                this.container.get('i18n')
            );
        }
        
        // 배치 요청 처리
        if (operation === 'batchRequest') {
            if (!request.body || !Array.isArray(request.body.requests)) {
                throw new ValidationError('Batch request requires requests array in body', 'body', request.body);
            }
            return apiClient.batchRequest(request.body.requests, request.body.options);
        }
        
        // 일반 요청 처리
        const params = { ...request.query };
        delete params.operation; // operation 파라미터 제거
        
        // 위치 기반 요청의 경우 거리 정보 추가
        if (operation === 'locationBasedList' && params.mapX && params.mapY) {
            const result = await apiClient[operation](params, { identifier: request.ip });
            
            // 거리 정보 추가 (선택적)
            if (result.data && result.data.items && params.addDistance === 'Y') {
                result.data.items = GeoUtils.addDistanceInfo(
                    result.data.items,
                    params.mapY,
                    params.mapX,
                    params.radius || 1000,
                    { unit: 'm', sortByDistance: true }
                );
            }
            
            return result;
        }
        
        return apiClient[operation](params, { identifier: request.ip });
    }
    
    /**
     * 응답을 포맷합니다
     * @param {number} statusCode - HTTP 상태 코드
     * @param {object} data - 응답 데이터
     * @param {object} metadata - 메타데이터
     * @returns {object} 포맷된 응답
     */
    formatResponse(statusCode, data, metadata = {}) {
        const response = {
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'X-Request-ID': metadata.requestId,
                'X-Response-Time': `${metadata.responseTime}ms`
            },
            body: JSON.stringify(data, null, 2)
        };
        
        return response;
    }
    
    /**
     * 에러 응답을 포맷합니다
     * @param {Error} error - 에러 객체
     * @param {object} metadata - 메타데이터
     * @returns {object} 포맷된 에러 응답
     */
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
    
    /**
     * 핸들러 인스턴스를 정리합니다
     */
    destroy() {
        if (this.container) {
            this.container.destroy();
        }
        this.initialized = false;
        console.log('Tourism API handler destroyed');
    }
}

// ===== 전역 인스턴스 및 내보내기 =====

// 전역 핸들러 인스턴스 (서버리스 환경에서 재사용)
let globalHandler = null;
/**
 * 메인 서버리스 함수 핸들러 (Vercel 최적화 버전)
 * @param {object} req - Vercel Request 객체
 * @param {object} res - Vercel Response 객체
 * @returns {Promise<void>} 응답 처리
 */
async function handler(req, res) {
    try {
        // CORS 헤더 설정
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        // OPTIONS 요청 처리
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        
        // 전역 핸들러 인스턴스 재사용 (콜드 스타트 최적화)
        if (!globalHandler) {
            globalHandler = new TourismApiHandler();
        }
        
        // Vercel req/res를 AWS Lambda event/context 형식으로 변환
        const event = {
            httpMethod: req.method,
            queryStringParameters: req.query || {},
            body: req.method === 'POST' ? JSON.stringify(req.body) : null,
            headers: req.headers || {},
            path: req.url || '/',
            requestContext: {
                requestId: req.headers['x-vercel-id'] || SafeUtils.generateRequestId('vercel')
            }
        };
        
        const context = {
            requestId: event.requestContext.requestId,
            functionName: 'tourism-api',
            functionVersion: '1.0.0',
            memoryLimitInMB: '1024',
            getRemainingTimeInMillis: () => 30000 // Vercel 기본 타임아웃
        };
        
        const result = await globalHandler.handle(event, context);
        
        // 응답 처리
        const statusCode = result.statusCode || 200;
        const headers = result.headers || {};
        
        // 헤더 설정
        Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value);
        });
        
        // Content-Type이 설정되지 않은 경우 기본값 설정
        if (!res.getHeader('Content-Type')) {
            res.setHeader('Content-Type', 'application/json');
        }
        
        // 응답 전송
        if (result.body) {
            return res.status(statusCode).send(result.body);
        } else {
            return res.status(statusCode).end();
        }
        
    } catch (error) {
        console.error('Critical handler error:', error);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        return res.status(500).json({
            success: false,
            error: {
                code: 'CRITICAL_ERROR',
                message: 'A critical error occurred',
                timestamp: new Date().toISOString()
            }
        });
    }
}

// 정리 함수 (필요시 호출)
function cleanup() {
    if (globalHandler) {
        globalHandler.destroy();
        globalHandler = null;
    }
}

// Node.js 환경에서 모듈 내보내기 (Vercel 최적화)
if (NODE_ENV && typeof module !== 'undefined' && module.exports) {
    // Vercel 서버리스 함수 기본 export
    module.exports = handler;
    
    // 추가 유틸리티들도 export (필요시 사용)
    module.exports.handler = handler;
    module.exports.cleanup = cleanup;
    module.exports.TourismApiHandler = TourismApiHandler;
    module.exports.TourismApiClient = TourismApiClient;
    module.exports.SafeUtils = SafeUtils;
    module.exports.GeoUtils = GeoUtils;
    module.exports.SecurityModule = SecurityModule;
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
        handler,
        cleanup,
        TourismApiHandler,
        TourismApiClient,
        SafeUtils,
        GeoUtils,
        SecurityModule,
        AdvancedCache,
        RateLimiter,
        ServiceContainer,
        InternationalizationManager,
        ResponseFormatter,
        HttpClient
    };
}

// ===== 사용 예제 및 문서 =====
/**
 * 사용 예제:
 * 
 * // 1. 서버리스 함수로 사용
 * exports.handler = handler;
 * 
 * // 2. 직접 API 클라이언트 사용
 * const client = new TourismApiClient({ apiKey: 'your-api-key' });
 * const result = await client.areaBasedList({ areaCode: 1 });
 * 
 * // 3. 위치 기반 검색
 * const locationResult = await client.locationBasedList({
 *   mapX: 126.981611,
 *   mapY: 37.568477,
 *   radius: 1000
 * });
 * 
 * // 4. 키워드 검색
 * const searchResult = await client.searchKeyword({
 *   keyword: '경복궁',
 *   numOfRows: 10
 * });
 * 
 * // 5. 배치 요청
 * const batchResult = await client.batchRequest([
 *   { method: 'areaBasedList', params: { areaCode: 1 } },
 *   { method: 'searchKeyword', params: { keyword: '서울' } }
 * ]);
 */

console.log('Tourism API Ultimate Version loaded successfully');
console.log('Security status:', securityLibraryStatus);
console.log('Environment:', NODE_ENV ? 'Node.js' : 'Browser');
console.log('Service start time:', new Date(SERVICE_START_TIME).toISOString());

