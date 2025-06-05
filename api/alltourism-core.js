// ===== alltourism-core.js - 한국관광공사 API 핵심 클래스들 =====
'use strict';

/**
 * @typedef {Object} MemoryUsage
 * @property {number} heapUsed - 사용 중인 힙 메모리 (바이트)
 * @property {number} heapTotal - 총 힙 메모리 (바이트)
 * @property {number} external - 외부 메모리 (바이트)
 * @property {number} rss - RSS 메모리 (바이트)
 */

// ===== 런타임 환경 감지 및 안전한 폴리필 =====
const RuntimeEnvironment = {
    isNode: typeof window === 'undefined' && typeof global !== 'undefined',
    isBrowser: typeof window !== 'undefined',
    isWebWorker: typeof importScripts === 'function',

    /**
     * Node.js 환경에서 필요한 폴리필을 설정합니다
     * @returns {Promise<void>}
     */
    async setupPolyfills() {
        if (this.isNode) {
            try {
                if (typeof fetch === 'undefined') {
                    const { default: fetch } = await import('node-fetch');
                    const { default: AbortController } = await import('abort-controller');
                    global.fetch = fetch;
                    global.AbortController = AbortController;
                }
            } catch (error) {
                console.warn('Node.js fetch polyfill failed:', error.message);
                throw new Error('Required dependencies not available for Node.js environment');
            }
        }
    },

    /**
     * 환경변수 값을 안전하게 가져옵니다
     * @param {string} key - 환경변수 키
     * @param {*} defaultValue - 기본값
     * @returns {*} 환경변수 값 또는 기본값
     */
    getEnvironmentVariable(key, defaultValue = null) {
        if (!key || typeof key !== 'string') {
            return defaultValue;
        }

        // Node.js 환경
        if (this.isNode && typeof process !== 'undefined' && process.env) {
            const value = process.env[key];
            return value !== undefined ? value : defaultValue;
        }

        // 브라우저 환경
        if (this.isBrowser && typeof window !== 'undefined' && window.APP_CONFIG) {
            const value = window.APP_CONFIG[key];
            return value !== undefined ? value : defaultValue;
        }

        // 웹워커 환경
        if (this.isWebWorker && typeof self !== 'undefined' && self.APP_CONFIG) {
            const value = self.APP_CONFIG[key];
            return value !== undefined ? value : defaultValue;
        }

        return defaultValue;
    },

    /**
     * 메모리 사용량을 가져옵니다
     * @returns {MemoryUsage} 메모리 사용량 정보
     */
    getMemoryUsage() {
        // Node.js 환경
        if (this.isNode && typeof process !== 'undefined' && process.memoryUsage) {
            return process.memoryUsage();
        }

        // 브라우저 환경
        if (this.isBrowser && performance && performance.memory) {
            return {
                heapUsed: performance.memory.usedJSHeapSize || 0,
                heapTotal: performance.memory.totalJSHeapSize || 0,
                external: 0,
                rss: 0
            };
        }

        // 기본값
        return { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 };
    }
};

// ===== 서비스 시작 시간 추적 =====
const SERVICE_START_TIME = Date.now();

// ===== 리소스 관리자 =====
class ResourceManager {
    constructor() {
        this.intervals = new Set();
        this.timeouts = new Set();
        this.destroyed = false;
        this.lastCleanup = Date.now();
    }

    /**
     * setInterval을 추적하여 관리합니다
     * @param {Function} callback - 콜백 함수
     * @param {number} delay - 지연 시간 (ms)
     * @returns {number|null} interval ID 또는 null
     */
    setInterval(callback, delay) {
        if (this.destroyed || typeof callback !== 'function' || delay < 0) {
            return null;
        }

        const id = setInterval(() => {
            try {
                callback();
            } catch (error) {
                console.error('ResourceManager: Interval callback error:', error);
            }
        }, Math.max(0, delay));

        this.intervals.add(id);
        return id;
    }

    /**
     * setTimeout을 추적하여 관리합니다
     * @param {Function} callback - 콜백 함수
     * @param {number} delay - 지연 시간 (ms)
     * @returns {number|null} timeout ID 또는 null
     */
    setTimeout(callback, delay) {
        if (this.destroyed || typeof callback !== 'function' || delay < 0) {
            return null;
        }

        const id = setTimeout(() => {
            this.timeouts.delete(id);
            try {
                callback();
            } catch (error) {
                console.error('ResourceManager: Timeout callback error:', error);
            }
        }, Math.max(0, delay));

        this.timeouts.add(id);
        return id;
    }

    /**
     * interval을 정리합니다
     * @param {number} id - interval ID
     */
    clearInterval(id) {
        if (typeof id === 'number') {
            clearInterval(id);
            this.intervals.delete(id);
        }
    }

    /**
     * timeout을 정리합니다
     * @param {number} id - timeout ID
     */
    clearTimeout(id) {
        if (typeof id === 'number') {
            clearTimeout(id);
            this.timeouts.delete(id);
        }
    }

    /**
     * 모든 리소스를 정리하고 관리자를 파괴합니다
     */
    destroy() {
        if (this.destroyed) return;

        // 안전한 정리
        this.intervals.forEach(id => {
            try {
                clearInterval(id);
            } catch (error) {
                console.warn('Error clearing interval:', error);
            }
        });

        this.timeouts.forEach(id => {
            try {
                clearTimeout(id);
            } catch (error) {
                console.warn('Error clearing timeout:', error);
            }
        });

        this.intervals.clear();
        this.timeouts.clear();
        this.destroyed = true;
    }

    /**
     * 관리자가 파괴되었는지 확인합니다
     * @returns {boolean} 파괴 여부
     */
    isDestroyed() {
        return this.destroyed;
    }

    /**
     * 리소스 통계를 가져옵니다
     * @returns {Object} 리소스 통계
     */
    getStats() {
        return {
            intervals: this.intervals.size,
            timeouts: this.timeouts.size,
            destroyed: this.destroyed,
            uptime: Date.now() - this.lastCleanup
        };
    }
}

// ===== 의존성 주입 컨테이너 =====
class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.singletons = new Map();
        this.initialized = false;
        this.resourceManager = new ResourceManager();
        this.initializationTime = null;
    }

    /**
     * 서비스를 등록합니다
     * @param {string} name - 서비스 이름
     * @param {Function} factory - 팩토리 함수
     * @param {boolean} singleton - 싱글톤 여부
     * @returns {ServiceContainer} 체이닝을 위한 자기 참조
     */
    register(name, factory, singleton = true) {
        if (this.initialized) {
            throw new Error(`Cannot register service '${name}' after container initialization`);
        }

        if (!name || typeof name !== 'string') {
            throw new Error('Service name must be a non-empty string');
        }

        if (typeof factory !== 'function') {
            throw new Error('Service factory must be a function');
        }

        this.services.set(name, { factory, singleton });
        return this;
    }

    /**
     * 서비스를 가져옵니다
     * @param {string} name - 서비스 이름
     * @returns {*} 서비스 인스턴스
     */
    get(name) {
        if (!this.services.has(name)) {
            throw new Error(`Service '${name}' not registered. Available services: ${Array.from(this.services.keys()).join(', ')}`);
        }

        const service = this.services.get(name);

        if (service.singleton) {
            if (!this.singletons.has(name)) {
                try {
                    this.singletons.set(name, service.factory(this));
                } catch (error) {
                    throw new Error(`Failed to create service '${name}': ${error.message}`);
                }
            }
            return this.singletons.get(name);
        }

        return service.factory(this);
    }

    /**
     * 컨테이너를 초기화합니다
     * @returns {Promise<ServiceContainer>} 초기화된 컨테이너
     */
    async initialize() {
        if (this.initialized) return this;

        const startTime = Date.now();

        try {
            await RuntimeEnvironment.setupPolyfills();

            const initOrder = [
                'constants', 'i18n', 'config', 'logger', 'cache', 'rateLimiter',
                'validator', 'httpClient', 'security'
            ];

            for (const serviceName of initOrder) {
                if (this.services.has(serviceName)) {
                    try {
                        this.get(serviceName);
                    } catch (error) {
                        console.error(`Failed to initialize service '${serviceName}':`, error);
                        throw error;
                    }
                }
            }

            this.initialized = true;
            this.initializationTime = Date.now() - startTime;
            return this;
        } catch (error) {
            console.error('Container initialization failed:', error);
            throw error;
        }
    }

    /**
     * 컨테이너 초기화 여부를 확인합니다
     * @returns {boolean} 초기화 여부
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * 컨테이너와 모든 서비스를 정리합니다
     */
    destroy() {
        // 싱글톤 서비스들을 안전하게 정리
        this.singletons.forEach((service, name) => {
            if (service && typeof service.destroy === 'function') {
                try {
                    service.destroy();
                } catch (error) {
                    console.error(`Error destroying service '${name}':`, error);
                }
            }
        });

        this.singletons.clear();
        this.resourceManager.destroy();
        this.initialized = false;
        this.initializationTime = null;
    }

    /**
     * 컨테이너 통계를 가져옵니다
     * @returns {Object} 컨테이너 통계
     */
    getStats() {
        return {
            registered: this.services.size,
            singletons: this.singletons.size,
            initialized: this.initialized,
            initializationTime: this.initializationTime,
            resourceManager: this.resourceManager.getStats()
        };
    }
}

// ===== 동시성 제어 유틸리티 =====
class Semaphore {
    constructor(maxConcurrent) {
        this.maxConcurrent = Math.max(1, parseInt(maxConcurrent) || 1);
        this.currentConcurrent = 0;
        this.queue = [];
        this.destroyed = false;
        this.stats = {
            acquired: 0,
            released: 0,
            queued: 0,
            timeouts: 0
        };
    }

    /**
     * 세마포어를 획득합니다
     * @param {number} timeout - 타임아웃 (ms)
     * @returns {Promise<void>}
     */
    async acquire(timeout = 30000) {
        if (this.destroyed) {
            throw new Error('Semaphore has been destroyed');
        }

        return new Promise((resolve, reject) => {
            const request = { resolve, reject, timestamp: Date.now() };

            if (this.currentConcurrent < this.maxConcurrent) {
                this.currentConcurrent++;
                this.stats.acquired++;
                resolve();
            } else {
                this.queue.push(request);
                this.stats.queued++;

                // 타임아웃 설정
                if (timeout > 0) {
                    setTimeout(() => {
                        const index = this.queue.indexOf(request);
                        if (index !== -1) {
                            this.queue.splice(index, 1);
                            this.stats.timeouts++;
                            reject(new Error(`Semaphore acquire timeout after ${timeout}ms`));
                        }
                    }, timeout);
                }
            }
        });
    }

    /**
     * 세마포어를 해제합니다
     */
    release() {
        if (this.destroyed) return;

        this.currentConcurrent = Math.max(0, this.currentConcurrent - 1);
        this.stats.released++;

        if (this.queue.length > 0) {
            const next = this.queue.shift();
            this.currentConcurrent++;
            this.stats.acquired++;
            next.resolve();
        }
    }

    /**
     * 함수를 세마포어로 보호하여 실행합니다
     * @param {Function} fn - 실행할 함수
     * @param {number} timeout - 타임아웃 (ms)
     * @returns {Promise<*>} 함수 실행 결과
     */
    async execute(fn, timeout = 30000) {
        if (this.destroyed) {
            throw new Error('Semaphore has been destroyed');
        }

        await this.acquire(timeout);
        try {
            return await fn();
        } finally {
            this.release();
        }
    }

    /**
     * 세마포어를 파괴합니다
     */
    destroy() {
        this.destroyed = true;
        this.queue.forEach(({ reject }) => {
            reject(new Error('Semaphore destroyed'));
        });
        this.queue = [];
        this.currentConcurrent = 0;
    }

    /**
     * 세마포어 통계를 가져옵니다
     * @returns {Object} 통계 정보
     */
    getStats() {
        return {
            maxConcurrent: this.maxConcurrent,
            currentConcurrent: this.currentConcurrent,
            queueLength: this.queue.length,
            destroyed: this.destroyed,
            ...this.stats,
            efficiency: this.stats.acquired > 0 ? 
                ((this.stats.acquired - this.stats.timeouts) / this.stats.acquired * 100).toFixed(2) + '%' : '0%'
        };
    }
}

// ===== Accept-Language 파서 =====
class LanguageNegotiator {
    /**
     * Accept-Language 헤더를 파싱합니다
     * @param {string} acceptLanguageHeader - Accept-Language 헤더 값
     * @returns {Array<Object>} 파싱된 언어 목록
     */
    static parseAcceptLanguage(acceptLanguageHeader) {
        if (!acceptLanguageHeader || typeof acceptLanguageHeader !== 'string') {
            return [];
        }

        try {
            return acceptLanguageHeader
                .split(',')
                .map(lang => {
                    const [language, quality = 'q=1'] = lang.trim().split(';');
                    const qValue = quality.includes('=') ? quality.split('=')[1] : quality;
                    const q = parseFloat(qValue) || 1;
                    
                    return {
                        language: language.trim().toLowerCase(),
                        quality: Math.max(0, Math.min(1, q))
                    };
                })
                .filter(item => item.language.length > 0 && item.language !== '*')
                .sort((a, b) => b.quality - a.quality);
        } catch (error) {
            console.warn('Failed to parse Accept-Language header:', error);
            return [];
        }
    }

    /**
     * 최적의 언어 매치를 찾습니다
     * @param {string} acceptLanguageHeader - Accept-Language 헤더 값
     * @param {Set<string>} supportedLanguages - 지원하는 언어 목록
     * @returns {string|null} 매치된 언어 또는 null
     */
    static getBestMatch(acceptLanguageHeader, supportedLanguages) {
        if (!supportedLanguages || !(supportedLanguages instanceof Set)) {
            return null;
        }

        const preferences = this.parseAcceptLanguage(acceptLanguageHeader);

        for (const preference of preferences) {
            const lang = preference.language;

            // 정확한 매치 (예: ko-KR)
            if (supportedLanguages.has(lang)) {
                return lang;
            }

            // 기본 언어 매치 (예: ko-KR -> ko)
            const primaryLang = lang.split('-')[0];
            if (supportedLanguages.has(primaryLang)) {
                return primaryLang;
            }

            // 확장 매치 (예: ko -> ko-KR)
            for (const supported of supportedLanguages) {
                if (supported.startsWith(primaryLang + '-')) {
                    return supported;
                }
            }
        }

        return null;
    }
}

// ===== 다국어 지원 시스템 =====
class InternationalizationManager {
    constructor() {
        this.defaultLanguage = 'ko';
        this.currentLanguage = 'ko';
        this.messages = new Map();
        this.supportedLanguages = new Set(['ko', 'en', 'ja', 'zh-cn']);
        this.fallbackChain = new Map([
            ['ja', ['ko', 'en']],
            ['zh-cn', ['en', 'ko']],
            ['en', ['ko']],
            ['ko', ['en']]
        ]);
        this.setupMessages();
    }

    /**
     * 다국어 메시지를 설정합니다
     */
    setupMessages() {
        // 한국어 메시지
        this.messages.set('ko', {
            VALIDATION_ERROR: '입력값 검증 실패',
            API_TIMEOUT: 'API 요청 시간 초과: {timeout}ms',
            RATE_LIMIT_EXCEEDED: '요청 한도를 초과했습니다',
            CORS_ERROR: '허용되지 않은 Origin입니다',
            INVALID_API_KEY: '유효하지 않은 API 키입니다',
            MISSING_API_KEY: 'TOURISM_API_KEY 환경변수가 설정되지 않았습니다',
            UNSUPPORTED_OPERATION: '지원하지 않는 오퍼레이션: {operation}',
            NOT_FOUND: '데이터를 찾을 수 없습니다',
            EMPTY_RESPONSE: 'API 응답이 없습니다',
            HTTP_ERROR: 'HTTP {status}: {statusText}',
            NETWORK_ERROR: '네트워크 연결 오류가 발생했습니다',
            FIELD_REQUIRED: '는 필수 입력값입니다',
            INVALID_FORMAT: '의 형식이 올바르지 않습니다',
            INVALID_RANGE: '의 범위가 올바르지 않습니다',
            TYPE_MISMATCH: '는 {type} 타입이어야 합니다',
            MIN_LENGTH_ERROR: '는 최소 {minLength}자 이상이어야 합니다',
            MAX_LENGTH_ERROR: '는 최대 {maxLength}자 이하여야 합니다',
            NUMERIC_ERROR: '는 숫자여야 합니다',
            ENUM_ERROR: '는 다음 값 중 하나여야 합니다: {values}',
            BATCH_CONTENT_IDS_REQUIRED: '배치 작업에는 contentIds 배열이 필요합니다',
            CONFIG_VALIDATION_FAILED: '설정 검증 실패',
            API_ERROR: 'API 호출 오류: {message}',
            SERVICE_UNAVAILABLE: '서비스를 사용할 수 없습니다',
            INTERNAL_ERROR: '내부 서버 오류가 발생했습니다'
        });

        // 영어 메시지
        this.messages.set('en', {
            VALIDATION_ERROR: 'Validation failed',
            API_TIMEOUT: 'API request timeout: {timeout}ms',
            RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
            CORS_ERROR: 'Origin not allowed',
            INVALID_API_KEY: 'Invalid API key',
            MISSING_API_KEY: 'TOURISM_API_KEY environment variable not configured',
            UNSUPPORTED_OPERATION: 'Unsupported operation: {operation}',
            NOT_FOUND: 'Data not found',
            EMPTY_RESPONSE: 'Empty API response',
            HTTP_ERROR: 'HTTP {status}: {statusText}',
            NETWORK_ERROR: 'Network connection error occurred',
            FIELD_REQUIRED: ' is required',
            INVALID_FORMAT: ' has invalid format',
            INVALID_RANGE: ' is out of range',
            TYPE_MISMATCH: ' must be of type {type}',
            MIN_LENGTH_ERROR: ' must be at least {minLength} characters',
            MAX_LENGTH_ERROR: ' must be at most {maxLength} characters',
            NUMERIC_ERROR: ' must be a number',
            ENUM_ERROR: ' must be one of: {values}',
            BATCH_CONTENT_IDS_REQUIRED: 'Batch operation requires contentIds array',
            CONFIG_VALIDATION_FAILED: 'Configuration validation failed',
            API_ERROR: 'API call error: {message}',
            SERVICE_UNAVAILABLE: 'Service unavailable',
            INTERNAL_ERROR: 'Internal server error occurred'
        });

        // 일본어 메시지
        this.messages.set('ja', {
            VALIDATION_ERROR: 'バリデーションエラー',
            API_TIMEOUT: 'APIリクエストタイムアウト: {timeout}ms',
            RATE_LIMIT_EXCEEDED: 'レート制限を超えました',
            CORS_ERROR: 'Originが許可されていません',
            INVALID_API_KEY: '無効なAPIキーです',
            MISSING_API_KEY: 'TOURISM_API_KEY環境変数が設定されていません',
            UNSUPPORTED_OPERATION: 'サポートされていない操作: {operation}',
            NOT_FOUND: 'データが見つかりません',
            EMPTY_RESPONSE: 'API応答が空です',
            HTTP_ERROR: 'HTTP {status}: {statusText}',
            NETWORK_ERROR: 'ネットワーク接続エラーが発生しました',
            API_ERROR: 'API呼び出しエラー: {message}',
            SERVICE_UNAVAILABLE: 'サービスが利用できません',
            INTERNAL_ERROR: '内部サーバーエラーが発生しました'
        });

        // 중국어 메시지
        this.messages.set('zh-cn', {
            VALIDATION_ERROR: '验证失败',
            API_TIMEOUT: 'API请求超时: {timeout}ms',
            RATE_LIMIT_EXCEEDED: '超出速率限制',
            CORS_ERROR: '不允许的Origin',
            INVALID_API_KEY: '无效的API密钥',
            MISSING_API_KEY: '未配置TOURISM_API_KEY环境变量',
            UNSUPPORTED_OPERATION: '不支持的操作: {operation}',
            NOT_FOUND: '未找到数据',
            EMPTY_RESPONSE: 'API响应为空',
            HTTP_ERROR: 'HTTP {status}: {statusText}',
            NETWORK_ERROR: '发生网络连接错误',
            API_ERROR: 'API调用错误: {message}',
            SERVICE_UNAVAILABLE: '服务不可用',
            INTERNAL_ERROR: '发生内部服务器错误'
        });
    }

    /**
     * Accept-Language 헤더에서 언어를 설정합니다
     * @param {string} acceptLanguageHeader - Accept-Language 헤더 값
     */
    setLanguageFromHeader(acceptLanguageHeader) {
        const bestMatch = LanguageNegotiator.getBestMatch(acceptLanguageHeader, this.supportedLanguages);
        if (bestMatch) {
            this.currentLanguage = bestMatch;
        }
    }

    /**
     * 현재 언어를 설정합니다
     * @param {string} lang - 언어 코드
     * @returns {boolean} 설정 성공 여부
     */
    setLanguage(lang) {
        if (typeof lang === 'string' && this.supportedLanguages.has(lang.toLowerCase())) {
            this.currentLanguage = lang.toLowerCase();
            return true;
        }
        return false;
    }

    /**
     * 메시지를 가져옵니다
     * @param {string} code - 메시지 코드
     * @param {Object} params - 매개변수
     * @returns {string} 지역화된 메시지
     */
    getMessage(code, params = {}) {
        if (!code || typeof code !== 'string') {
            return code || '';
        }

        const message = this._getMessageWithFallback(code);

        // 매개변수 치환
        return Object.entries(params).reduce((msg, [key, value]) => {
            const placeholder = new RegExp(`{${key}}`, 'g');
            return msg.replace(placeholder, String(value || ''));
        }, message);
    }

    /**
     * 폴백 체인을 사용하여 메시지를 가져옵니다
     * @param {string} code - 메시지 코드
     * @returns {string} 메시지
     * @private
     */
    _getMessageWithFallback(code) {
        // 현재 언어에서 메시지 찾기
        const currentMessages = this.messages.get(this.currentLanguage);
        if (currentMessages && currentMessages[code]) {
            return currentMessages[code];
        }

        // 폴백 체인에서 찾기
        const fallbacks = this.fallbackChain.get(this.currentLanguage) || [];
        for (const fallbackLang of fallbacks) {
            const fallbackMessages = this.messages.get(fallbackLang);
            if (fallbackMessages && fallbackMessages[code]) {
                return fallbackMessages[code];
            }
        }

        // 기본 언어에서 찾기
        const defaultMessages = this.messages.get(this.defaultLanguage);
        if (defaultMessages && defaultMessages[code]) {
            return defaultMessages[code];
        }

        // 모든 방법이 실패하면 코드 자체 반환
        return code;
    }

    /**
     * 지원하는 언어 목록을 가져옵니다
     * @returns {Array<string>} 지원 언어 목록
     */
    getSupportedLanguages() {
        return Array.from(this.supportedLanguages);
    }

    /**
     * 언어를 추가합니다
     * @param {string} lang - 언어 코드
     * @param {Object} messages - 메시지 객체
     * @param {Array<string>} fallbacks - 폴백 언어 목록
     */
    addLanguage(lang, messages, fallbacks = []) {
        if (!lang || typeof lang !== 'string' || !messages || typeof messages !== 'object') {
            throw new Error('Invalid language or messages');
        }

        this.supportedLanguages.add(lang.toLowerCase());
        this.messages.set(lang.toLowerCase(), { ...messages });
        
        if (fallbacks.length > 0) {
            this.fallbackChain.set(lang.toLowerCase(), fallbacks);
        }
    }
}

// ===== 상수 관리 시스템 =====
class ConstantsManager {
    constructor() {
        this.initializeConstants();
        this.validateConstants();
    }

    /**
     * 상수들을 초기화합니다
     */
    initializeConstants() {
        this.SUPPORTED_OPERATIONS = [
            'areaCode', 'categoryCode', 'areaBasedList', 'locationBasedList',
            'searchKeyword', 'searchFestival', 'searchStay', 'detailCommon',
            'detailIntro', 'detailInfo', 'detailImage', 'areaBasedSyncList',
            'detailPetTour', 'ldongCode', 'lclsSystmCode', 'batchDetail'
        ];

        this.CONTENT_TYPE_MAP = {
            '12': { name: '관광지', icon: '🏛️', en: 'Tourist Spot', ja: '観光地', zhCn: '旅游景点' },
            '14': { name: '문화시설', icon: '🎭', en: 'Cultural Facility', ja: '文化施設', zhCn: '文化设施' },
            '15': { name: '축제/공연/행사', icon: '🎪', en: 'Festival/Event', ja: 'フェスティバル', zhCn: '节庆活动' },
            '25': { name: '여행코스', icon: '🗺️', en: 'Travel Course', ja: '旅行コース', zhCn: '旅游路线' },
            '28': { name: '레포츠', icon: '⛷️', en: 'Leisure Sports', ja: 'レジャースポーツ', zhCn: '休闲运动' },
            '32': { name: '숙박', icon: '🏨', en: 'Accommodation', ja: '宿泊', zhCn: '住宿' },
            '38': { name: '쇼핑', icon: '🛍️', en: 'Shopping', ja: 'ショッピング', zhCn: '购物' },
            '39': { name: '음식점', icon: '🍽️', en: 'Restaurant', ja: 'レストラン', zhCn: '餐厅' }
        };

        this.AREA_CODE_MAP = {
            '1': { name: '서울', emoji: '🏙️', en: 'Seoul', ja: 'ソウル', zhCn: '首尔' },
            '2': { name: '인천', emoji: '✈️', en: 'Incheon', ja: '仁川', zhCn: '仁川' },
            '3': { name: '대전', emoji: '🏢', en: 'Daejeon', ja: '大田', zhCn: '大田' },
            '4': { name: '대구', emoji: '🌆', en: 'Daegu', ja: '大邱', zhCn: '大邱' },
            '5': { name: '광주', emoji: '🌸', en: 'Gwangju', ja: '光州', zhCn: '光州' },
            '6': { name: '부산', emoji: '🌊', en: 'Busan', ja: '釜山', zhCn: '釜山' },
            '7': { name: '울산', emoji: '🏭', en: 'Ulsan', ja: '蔚山', zhCn: '蔚山' },
            '8': { name: '세종', emoji: '🏛️', en: 'Sejong', ja: '世宗', zhCn: '世宗' },
            '31': { name: '경기', emoji: '🏘️', en: 'Gyeonggi', ja: '京畿', zhCn: '京畿' },
            '32': { name: '강원', emoji: '⛰️', en: 'Gangwon', ja: '江原', zhCn: '江原' },
            '33': { name: '충북', emoji: '🏔️', en: 'Chungbuk', ja: '忠北', zhCn: '忠北' },
            '34': { name: '충남', emoji: '🌾', en: 'Chungnam', ja: '忠南', zhCn: '忠南' },
            '35': { name: '경북', emoji: '🏯', en: 'Gyeongbuk', ja: '慶北', zhCn: '庆北' },
            '36': { name: '경남', emoji: '🏞️', en: 'Gyeongnam', ja: '慶南', zhCn: '庆南' },
            '37': { name: '전북', emoji: '🌿', en: 'Jeonbuk', ja: '全北', zhCn: '全北' },
            '38': { name: '전남', emoji: '🍃', en: 'Jeonnam', ja: '全南', zhCn: '全南' },
            '39': { name: '제주', emoji: '🌺', en: 'Jeju', ja: '済州', zhCn: '济州' }
        };

        this.API_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';

        this.API_ENDPOINTS = {
            areaCode: 'areaCode2',
            categoryCode: 'categoryCode2',
            areaBasedList: 'areaBasedList2',
            locationBasedList: 'locationBasedList2',
            searchKeyword: 'searchKeyword2',
            searchFestival: 'searchFestival2',
            searchStay: 'searchStay2',
            detailCommon: 'detailCommon2',
            detailIntro: 'detailIntro2',
            detailInfo: 'detailInfo2',
            detailImage: 'detailImage2',
            areaBasedSyncList: 'areaBasedSyncList2',
            detailPetTour: 'detailPetTour2',
            ldongCode: 'ldongCode2',
            lclsSystmCode: 'lclsSystmCode2'
        };

        this.DEFAULT_CONFIG = {
            apiKey: null,
            appName: 'AllTourism-Enterprise',
            version: '2.0.0',
            allowedOrigins: [
                'https://your-blog.com',
                'https://www.your-blog.com',
                'https://your-travel-site.com'
            ],
            allowedApiKeys: [],
            rateLimitPerMinute: 1000,
            maxCacheSize: 5000,
            maxMemorySize: 50 * 1024 * 1024, // 50MB
            cacheTtl: 30 * 60 * 1000, // 30분
            apiTimeout: 15000,
            retryAttempts: 3,
            retryDelay: 1000,
            maxConcurrent: 10,
            enableMetrics: false,
            enableCompression: true,
            enableBatching: true,
            maxBatchSize: 5,
            environment: 'development',
            logLevel: 'info',
            defaultLanguage: 'ko',
            memoryCheckInterval: 30000,
            memoryThreshold: 0.9,
            securityEnabled: true,
            developmentOrigins: [
                'http://localhost:3000',
                'http://localhost:8080',
                'http://127.0.0.1:3000',
                'http://127.0.0.1:8080'
            ]
        };
    }

    /**
     * 상수들의 유효성을 검증합니다
     */
    validateConstants() {
        if (!this.API_BASE_URL || !this.API_ENDPOINTS) {
            throw new Error('Essential constants not initialized');
        }

        if (!Array.isArray(this.SUPPORTED_OPERATIONS) || this.SUPPORTED_OPERATIONS.length === 0) {
            throw new Error('SUPPORTED_OPERATIONS must be a non-empty array');
        }

        if (!this.CONTENT_TYPE_MAP || Object.keys(this.CONTENT_TYPE_MAP).length === 0) {
            throw new Error('CONTENT_TYPE_MAP cannot be empty');
        }
    }

    /**
     * 상수를 가져옵니다
     * @param {string} category - 카테고리
     * @param {string} key - 키 (선택사항)
     * @returns {*} 상수 값
     */
    get(category, key = null) {
        if (!category || typeof category !== 'string') {
            return null;
        }

        const categoryValue = this[category];
        if (categoryValue === undefined) {
            return null;
        }

        if (key === null) {
            return categoryValue;
        }

        return categoryValue && categoryValue[key];
    }

    /**
     * 오퍼레이션이 유효한지 확인합니다
     * @param {string} operation - 오퍼레이션 이름
     * @returns {boolean} 유효성 여부
     */
    isValidOperation(operation) {
        return typeof operation === 'string' && this.SUPPORTED_OPERATIONS.includes(operation);
    }

    /**
     * 콘텐츠 타입명을 가져옵니다
     * @param {string} contentTypeId - 콘텐츠 타입 ID
     * @param {string} lang - 언어 코드
     * @returns {string} 콘텐츠 타입명
     */
    getContentTypeName(contentTypeId, lang = 'ko') {
        const contentType = this.CONTENT_TYPE_MAP[contentTypeId];
        if (!contentType) {
            return this._getDefaultByLanguage(lang, 'other');
        }

        return this._getLocalizedValue(contentType, lang) || contentType.name;
    }

    /**
     * 지역명을 가져옵니다
     * @param {string} areaCode - 지역 코드
     * @param {string} lang - 언어 코드
     * @returns {string} 지역명
     */
    getAreaName(areaCode, lang = 'ko') {
        const area = this.AREA_CODE_MAP[areaCode];
        if (!area) {
            return this._getDefaultByLanguage(lang, 'other');
        }

        return this._getLocalizedValue(area, lang) || area.name;
    }

    /**
     * 지역화된 값을 가져옵니다
     * @param {Object} obj - 객체
     * @param {string} lang - 언어 코드
     * @returns {string} 지역화된 값
     * @private
     */
    _getLocalizedValue(obj, lang) {
        const langMap = {
            'ko': 'name',
            'en': 'en',
            'ja': 'ja',
            'zh-cn': 'zhCn'
        };

        const prop = langMap[lang] || 'name';
        return obj[prop];
    }

    /**
     * 언어별 기본값을 가져옵니다
     * @param {string} lang - 언어 코드
     * @param {string} type - 타입
     * @returns {string} 기본값
     * @private
     */
    _getDefaultByLanguage(lang, type) {
        const defaults = {
            'ko': { other: '기타' },
            'en': { other: 'Other' },
            'ja': { other: 'その他' },
            'zh-cn': { other: '其他' }
        };

        return (defaults[lang] && defaults[lang][type]) || defaults['ko'][type];
    }

    /**
     * API URL을 생성합니다
     * @param {string} endpoint - 엔드포인트 이름
     * @returns {string} 완전한 API URL
     */
    getApiUrl(endpoint) {
        if (!this.API_ENDPOINTS[endpoint]) {
            throw new Error(`Unknown API endpoint: ${endpoint}`);
        }
        return `${this.API_BASE_URL}/${this.API_ENDPOINTS[endpoint]}`;
    }
}

// ===== 설정 관리 시스템 =====
class ConfigManager {
    constructor(container) {
        this.container = container;
        this.config = {};
        this.validators = new Map();
        this.subscribers = new Set();
        this.environmentOverrides = new Map();
        this.initialized = false;

        this.registerValidators();
        this.setupEnvironmentOverrides();
        this.config = this.loadConfig();
        this.applyEnvironmentOverrides(this.config);
        this.initialized = true;
    }

    /**
     * 정수 값을 기본값과 함께 파싱합니다
     * @param {*} value - 파싱할 값
     * @param {number} defaultValue - 기본값
     * @returns {number} 파싱된 정수
     */
    parseIntWithDefault(value, defaultValue) {
        if (typeof value === 'number') return Math.floor(value);
        const parsed = parseInt(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * 실수 값을 기본값과 함께 파싱합니다
     * @param {*} value - 파싱할 값
     * @param {number} defaultValue - 기본값
     * @returns {number} 파싱된 실수
     */
    parseFloatWithDefault(value, defaultValue) {
        if (typeof value === 'number') return value;
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * 불리언 값을 기본값과 함께 파싱합니다
     * @param {*} value - 파싱할 값
     * @param {boolean} defaultValue - 기본값
     * @returns {boolean} 파싱된 불리언
     */
    parseBooleanWithDefault(value, defaultValue) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
        }
        return defaultValue;
    }

    /**
     * 배열을 파싱합니다
     * @param {*} envVar - 환경변수 값
     * @returns {Array|null} 파싱된 배열
     */
    parseArray(envVar) {
        if (!envVar) return null;
        if (Array.isArray(envVar)) return envVar;
        return envVar.split(',').map(item => item.trim()).filter(item => item.length > 0);
    }

    /**
     * 설정을 로드합니다
     * @returns {Object} 로드된 설정
     */
    loadConfig() {
        const constants = this.container ? this.container.get('constants') : new ConstantsManager();
        const defaultConfig = { ...constants.DEFAULT_CONFIG };

        const apiKey = RuntimeEnvironment.getEnvironmentVariable('TOURISM_API_KEY') || defaultConfig.apiKey;

        return {
            ...defaultConfig,
            apiKey: apiKey,
            allowedOrigins: this.parseArray(RuntimeEnvironment.getEnvironmentVariable('ALLOWED_ORIGINS')) || defaultConfig.allowedOrigins,
            allowedApiKeys: this.parseArray(RuntimeEnvironment.getEnvironmentVariable('ALLOWED_API_KEYS')) || defaultConfig.allowedApiKeys,
            rateLimitPerMinute: this.parseIntWithDefault(RuntimeEnvironment.getEnvironmentVariable('RATE_LIMIT'), defaultConfig.rateLimitPerMinute),
            maxCacheSize: this.parseIntWithDefault(RuntimeEnvironment.getEnvironmentVariable('MAX_CACHE_SIZE'), defaultConfig.maxCacheSize),
            maxMemorySize: this.parseIntWithDefault(RuntimeEnvironment.getEnvironmentVariable('MAX_MEMORY_SIZE'), defaultConfig.maxMemorySize),
            cacheTtl: this.parseIntWithDefault(RuntimeEnvironment.getEnvironmentVariable('CACHE_TTL'), defaultConfig.cacheTtl),
            apiTimeout: this.parseIntWithDefault(RuntimeEnvironment.getEnvironmentVariable('API_TIMEOUT'), defaultConfig.apiTimeout),
            retryAttempts: this.parseIntWithDefault(RuntimeEnvironment.getEnvironmentVariable('RETRY_ATTEMPTS'), defaultConfig.retryAttempts),
            retryDelay: this.parseIntWithDefault(RuntimeEnvironment.getEnvironmentVariable('RETRY_DELAY'), defaultConfig.retryDelay),
            maxConcurrent: this.parseIntWithDefault(RuntimeEnvironment.getEnvironmentVariable('MAX_CONCURRENT'), defaultConfig.maxConcurrent),
            enableMetrics: this.parseBooleanWithDefault(RuntimeEnvironment.getEnvironmentVariable('ENABLE_METRICS'), defaultConfig.enableMetrics),
            enableCompression: this.parseBooleanWithDefault(RuntimeEnvironment.getEnvironmentVariable('ENABLE_COMPRESSION'), defaultConfig.enableCompression),
            enableBatching: this.parseBooleanWithDefault(RuntimeEnvironment.getEnvironmentVariable('ENABLE_BATCHING'), defaultConfig.enableBatching),
            maxBatchSize: this.parseIntWithDefault(RuntimeEnvironment.getEnvironmentVariable('MAX_BATCH_SIZE'), defaultConfig.maxBatchSize),
            environment: RuntimeEnvironment.getEnvironmentVariable('NODE_ENV') || defaultConfig.environment,
            logLevel: RuntimeEnvironment.getEnvironmentVariable('LOG_LEVEL') || defaultConfig.logLevel,
            defaultLanguage: RuntimeEnvironment.getEnvironmentVariable('DEFAULT_LANGUAGE') || defaultConfig.defaultLanguage,
            memoryCheckInterval: this.parseIntWithDefault(RuntimeEnvironment.getEnvironmentVariable('MEMORY_CHECK_INTERVAL'), defaultConfig.memoryCheckInterval),
            memoryThreshold: this.parseFloatWithDefault(RuntimeEnvironment.getEnvironmentVariable('MEMORY_THRESHOLD'), defaultConfig.memoryThreshold),
            securityEnabled: this.parseBooleanWithDefault(RuntimeEnvironment.getEnvironmentVariable('SECURITY_ENABLED'), defaultConfig.securityEnabled)
        };
    }

    /**
     * 환경별 오버라이드를 설정합니다
     */
    setupEnvironmentOverrides() {
        this.environmentOverrides.set('production', {
            allowedOrigins: (origins) => origins.filter(origin => 
                !origin.includes('localhost') && !origin.includes('127.0.0.1')
            ),
            enableMetrics: true,
            logLevel: 'warn',
            securityEnabled: true,
            retryAttempts: 5
        });

        this.environmentOverrides.set('development', {
            enableMetrics: false,
            logLevel: 'debug',
            securityEnabled: false
        });

        this.environmentOverrides.set('test', {
            enableMetrics: false,
            logLevel: 'error',
            rateLimitPerMinute: 10000,
            cacheTtl: 60000
        });
    }

    /**
     * 환경별 오버라이드를 적용합니다
     * @param {Object} config - 설정 객체
     */
    applyEnvironmentOverrides(config) {
        const env = config.environment;
        const overrides = this.environmentOverrides.get(env);

        if (overrides) {
            Object.entries(overrides).forEach(([key, value]) => {
                if (typeof value === 'function') {
                    config[key] = value(config[key]);
                } else {
                    config[key] = value;
                }
            });
        }
    }

    /**
     * 검증자들을 등록합니다
     */
    registerValidators() {
        this.validators.set('allowedOrigins', (value) => {
            if (!Array.isArray(value)) return false;
            return value.every(origin => typeof origin === 'string' && origin.length > 0);
        });

        this.validators.set('rateLimitPerMinute', (value) => {
            const num = parseInt(value);
            return !isNaN(num) && num > 0 && num <= 100000;
        });

        this.validators.set('maxCacheSize', (value) => {
            const num = parseInt(value);
            return !isNaN(num) && num > 0 && num <= 1000000;
        });

        this.validators.set('apiTimeout', (value) => {
            const num = parseInt(value);
            return !isNaN(num) && num >= 1000 && num <= 300000;
        });

        this.validators.set('cacheTtl', (value) => {
            const num = parseInt(value);
            return !isNaN(num) && num >= 10000;
        });

        this.validators.set('maxConcurrent', (value) => {
            const num = parseInt(value);
            return !isNaN(num) && num > 0 && num <= 100;
        });

        this.validators.set('memoryThreshold', (value) => {
            const num = parseFloat(value);
            return !isNaN(num) && num > 0 && num <= 1;
        });

        this.validators.set('apiKey', (value) => {
            return typeof value === 'string' && value.trim().length >= 20;
        });
    }

    /**
     * 설정 값을 가져옵니다
     * @param {string} key - 설정 키
     * @returns {*} 설정 값
     */
    get(key) {
        if (!key || typeof key !== 'string') {
            return undefined;
        }
        return this.config[key];
    }

    /**
     * 설정 값을 설정합니다
     * @param {string} key - 설정 키
     * @param {*} value - 설정 값
     */
    set(key, value) {
        if (!key || typeof key !== 'string') {
            throw new Error('Config key must be a non-empty string');
        }

        if (this.validators.has(key)) {
            if (!this.validators.get(key)(value)) {
                throw new Error(`Invalid value for config key '${key}': ${value}`);
            }
        }

        const oldValue = this.config[key];
        this.config[key] = value;

        if (this.initialized) {
            this.notifySubscribers(key, value, oldValue);
        }
    }

    /**
     * 설정 변경을 구독합니다
     * @param {Function} callback - 콜백 함수
     * @returns {Function} 구독 해제 함수
     */
    subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    /**
     * 구독자들에게 변경사항을 알립니다
     * @param {string} key - 변경된 키
     * @param {*} newValue - 새 값
     * @param {*} oldValue - 이전 값
     */
    notifySubscribers(key, newValue, oldValue) {
        this.subscribers.forEach(callback => {
            try {
                callback(key, newValue, oldValue);
            } catch (error) {
                console.error('Config subscriber error:', error);
            }
        });
    }

    /**
     * 설정을 검증합니다
     * @returns {boolean} 검증 성공 여부
     */
    validateConfig() {
        const errors = [];
        const warnings = [];

        if (!this.config.apiKey) {
            errors.push('TOURISM_API_KEY 환경변수가 설정되지 않았습니다');
        } else if (this.config.apiKey.length < 20) {
            warnings.push('API 키가 너무 짧습니다. 유효한 키인지 확인하세요');
        }

        if (this.config.rateLimitPerMinute <= 0) {
            errors.push('rateLimitPerMinute은 0보다 커야 합니다');
        }

        if (this.config.maxCacheSize <= 0) {
            errors.push('maxCacheSize는 0보다 커야 합니다');
        } else if (this.config.maxCacheSize > 50000) {
            warnings.push('캐시 크기가 큽니다. 메모리 사용량을 확인하세요');
        }

        if (this.config.apiTimeout < 1000) {
            errors.push('apiTimeout은 1000ms 이상이어야 합니다');
        }

        if (this.config.memoryThreshold > 0.95) {
            warnings.push('메모리 임계값이 높습니다. 시스템 안정성에 영향을 줄 수 있습니다');
        }

        if (warnings.length > 0) {
            console.warn('Configuration warnings:', warnings);
        }

        if (errors.length > 0) {
            throw new Error(`설정 검증 실패: ${errors.join(', ')}`);
        }

        return true;
    }

    /**
     * 초기화 여부를 확인합니다
     * @returns {boolean} 초기화 여부
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * 유효한 API 키가 있는지 확인합니다
     * @returns {boolean} API 키 유효성
     */
    hasValidApiKey() {
        return !!(this.config.apiKey && 
                 typeof this.config.apiKey === 'string' && 
                 this.config.apiKey.trim().length >= 20);
    }

    /**
     * 설정 관리자를 정리합니다
     */
    destroy() {
        this.subscribers.clear();
        this.initialized = false;
    }

    /**
     * 모든 설정을 가져옵니다
     * @returns {Object} 설정 객체 복사본
     */
    getAllConfig() {
        return { ...this.config };
    }
}

// ===== 로깅 시스템 =====
class Logger {
    constructor(container) {
        this.container = container;
        this.configManager = container ? container.get('config') : null;
        this.logLevel = this.configManager?.get('logLevel') || 'info';
        this.logLevels = { debug: 0, info: 1, warn: 2, error: 3 };
        this.metricsBuffer = [];
        this.maxMetricsBuffer = 1000;
        this.resourceManager = container?.resourceManager || new ResourceManager();

        this.setupConfigSubscription();
    }

    /**
     * 설정 변경을 구독합니다
     */
    setupConfigSubscription() {
        if (this.configManager) {
            this.configManager.subscribe((key, newValue) => {
                if (key === 'logLevel') {
                    this.logLevel = newValue;
                }
            });
        }
    }

    /**
     * 로그 레벨이 출력 가능한지 확인합니다
     * @param {string} level - 로그 레벨
     * @returns {boolean} 출력 가능 여부
     */
    shouldLog(level) {
        return this.logLevels[level] >= this.logLevels[this.logLevel];
    }

    /**
     * 로그 메시지를 포맷합니다
     * @param {string} level - 로그 레벨
     * @param {string} message - 메시지
     * @param {Object} data - 추가 데이터
     * @returns {Object} 포맷된 로그 객체
     */
    formatMessage(level, message, data = {}) {
        const timestamp = new Date().toISOString();

        const baseInfo = {
            timestamp,
            level: level.toUpperCase(),
            message: String(message || ''),
            uptime: this.getPreciseUptime()
        };

        if (RuntimeEnvironment.isNode) {
            baseInfo.pid = process.pid;
        }

        if (this.configManager) {
            baseInfo.environment = this.configManager.get('environment') || 'unknown';
        }

        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            baseInfo.data = this._sanitizeData(data);
        }

        return baseInfo;
    }

    /**
     * 데이터를 안전하게 정리합니다
     * @param {*} data - 정리할 데이터
     * @returns {*} 정리된 데이터
     * @private
     */
    _sanitizeData(data) {
        try {
            // 순환 참조 제거 및 민감한 정보 필터링
            return JSON.parse(JSON.stringify(data, (key, value) => {
                // 민감한 키 필터링
                const sensitiveKeys = ['password', 'apikey', 'token', 'secret', 'key'];
                if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
                    return '[FILTERED]';
                }
                return value;
            }));
        } catch (error) {
            return '[CIRCULAR_OR_INVALID_DATA]';
        }
    }

    /**
     * 정확한 업타임을 가져옵니다
     * @returns {number} 업타임 (밀리초)
     */
    getPreciseUptime() {
        return Date.now() - SERVICE_START_TIME;
    }

    /**
     * 디버그 로그를 출력합니다
     * @param {string} message - 메시지
     * @param {Object} data - 추가 데이터
     */
    debug(message, data) {
        if (this.shouldLog('debug')) {
            console.debug('🔍', JSON.stringify(this.formatMessage('debug', message, data)));
        }
    }

    /**
     * 정보 로그를 출력합니다
     * @param {string} message - 메시지
     * @param {Object} data - 추가 데이터
     */
    info(message, data) {
        if (this.shouldLog('info')) {
            console.log('ℹ️', JSON.stringify(this.formatMessage('info', message, data)));
        }
    }

    /**
     * 경고 로그를 출력합니다
     * @param {string} message - 메시지
     * @param {Object} data - 추가 데이터
     */
    warn(message, data) {
        if (this.shouldLog('warn')) {
            console.warn('⚠️', JSON.stringify(this.formatMessage('warn', message, data)));
        }
    }

    /**
     * 에러 로그를 출력합니다
     * @param {string} message - 메시지
     * @param {Error|Object} error - 에러 객체
     */
    error(message, error) {
        if (this.shouldLog('error')) {
            const errorData = this._processError(error);
            console.error('🚨', JSON.stringify(this.formatMessage('error', message, errorData)));
        }
    }

    /**
     * 에러 객체를 처리합니다
     * @param {*} error - 에러
     * @returns {Object} 처리된 에러 데이터
     * @private
     */
    _processError(error) {
        if (error instanceof Error) {
            return {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: error.code
            };
        }

        if (typeof error === 'object' && error !== null) {
            return this._sanitizeData(error);
        }

        return { error: String(error) };
    }

    /**
     * 메트릭을 기록합니다
     * @param {string} metricName - 메트릭 이름
     * @param {number} value - 값
     * @param {Object} tags - 태그
     */
    metric(metricName, value, tags = {}) {
        if (this.configManager?.get('enableMetrics')) {
            const metricData = {
                metric: metricName,
                value: parseFloat(value) || 0,
                tags: this._sanitizeData(tags),
                timestamp: Date.now()
            };

            this.metricsBuffer.push(metricData);

            if (this.metricsBuffer.length > this.maxMetricsBuffer) {
                this.metricsBuffer = this.metricsBuffer.slice(-this.maxMetricsBuffer);
            }

            this.debug('METRIC', metricData);
        }
    }

    /**
     * 수집된 메트릭을 가져옵니다
     * @returns {Array} 메트릭 배열
     */
    getMetrics() {
        return [...this.metricsBuffer];
    }

    /**
     * 메트릭을 정리합니다
     */
    clearMetrics() {
        this.metricsBuffer = [];
    }

    /**
     * 메트릭 통계를 가져옵니다
     * @returns {Object} 메트릭 통계
     */
    getMetricsStats() {
        const now = Date.now();
        const last5Min = this.metricsBuffer.filter(m => now - m.timestamp < 5 * 60 * 1000);
        const last1Hour = this.metricsBuffer.filter(m => now - m.timestamp < 60 * 60 * 1000);

        return {
            total: this.metricsBuffer.length,
            last5Minutes: last5Min.length,
            lastHour: last1Hour.length,
            oldestTimestamp: this.metricsBuffer.length > 0 ? 
                Math.min(...this.metricsBuffer.map(m => m.timestamp)) : null,
            newestTimestamp: this.metricsBuffer.length > 0 ? 
                Math.max(...this.metricsBuffer.map(m => m.timestamp)) : null
        };
    }

    /**
     * 로거를 정리합니다
     */
    destroy() {
        this.clearMetrics();
    }
}

// 모듈 내보내기
module.exports = {
    RuntimeEnvironment,
    SERVICE_START_TIME,
    ResourceManager,
    ServiceContainer,
    Semaphore,
    LanguageNegotiator,
    InternationalizationManager,
    ConstantsManager,
    ConfigManager,
    Logger
};
