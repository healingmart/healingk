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

// ===== 유틸리티 함수들 =====
class Utils {
    static safeParseInt(value, defaultValue = 0) {
        if (value === null || value === undefined || value === '') return defaultValue;
        const parsed = parseInt(String(value), 10);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    static safeParseFloat(value, defaultValue = 0.0) {
        if (value === null || value === undefined || value === '') return defaultValue;
        const parsed = parseFloat(String(value));
        return isNaN(parsed) ? defaultValue : parsed;
    }

    static sanitizeInput(input, maxLength = 1000) {
        if (typeof input !== 'string') return input;
        return input.slice(0, maxLength).trim();
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
            .trim();
    }

    static maskSensitiveData(data) {
        if (typeof data !== 'object' || data === null) return data;
        const sensitiveKeys = ['password', 'apikey', 'token', 'secret', 'servicekey'];
        const masked = JSON.parse(JSON.stringify(data));
        
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

    static deepClone(obj) {
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch {
            return obj;
        }
    }

    static isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ===== 에러 클래스들 =====
class TourismApiError extends Error {
    constructor(message, operation = 'unknown', statusCode = 500, details = {}) {
        super(message);
        this.name = 'TourismApiError';
        this.operation = operation;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

class ValidationError extends TourismApiError {
    constructor(message, field, value) {
        super(message, 'validation', 400, { field, value });
        this.name = 'ValidationError';
    }
}

class ApiTimeoutError extends TourismApiError {
    constructor(timeout, operation) {
        super(`API 요청 시간 초과 (${timeout}ms)`, operation, 408, { timeout });
        this.name = 'ApiTimeoutError';
    }
}

class RateLimitError extends TourismApiError {
    constructor(limit, remaining) {
        super('요청 한도 초과', 'rateLimit', 429, { limit, remaining });
        this.name = 'RateLimitError';
    }
}

// ===== 상수 관리 =====
class Constants {
    static CONTENT_TYPES = {
        '12': '관광지',
        '14': '문화시설', 
        '15': '축제공연행사',
        '25': '여행코스',
        '28': '레포츠',
        '32': '숙박',
        '38': '쇼핑',
        '39': '음식점'
    };

    static AREA_CODES = {
        '1': '서울', '2': '인천', '3': '대전', '4': '대구',
        '5': '광주', '6': '부산', '7': '울산', '8': '세종특별자치시',
        '31': '경기도', '32': '강원도', '33': '충청북도', '34': '충청남도',
        '35': '경상북도', '36': '경상남도', '37': '전라북도', '38': '전라남도', '39': '제주도'
    };

    static SUPPORTED_OPERATIONS = [
        'areaBasedList', 'detailCommon', 'detailIntro', 'detailInfo',
        'detailImage', 'searchKeyword', 'searchFestival', 'locationBasedList',
        'areaCode', 'categoryCode'
    ];

    static getContentTypeName(code) {
        return this.CONTENT_TYPES[code] || '알 수 없음';
    }

    static getAreaName(code) {
        return this.AREA_CODES[code] || '알 수 없음';
    }

    static isValidOperation(operation) {
        return this.SUPPORTED_OPERATIONS.includes(operation);
    }
}

// ===== 설정 관리 =====
class Config {
    constructor(options = {}) {
        this.settings = {
            version: '2.0.0',
            environment: (hasProcess && process.env.NODE_ENV) || 'development',
            serviceKey: (hasProcess && process.env.SERVICE_KEY) || options.serviceKey || '',
            baseUrl: 'https://apis.data.go.kr/B551011/KorService1',
            timeout: 30000,
            maxConcurrent: 10,
            rateLimitPerMinute: 100,
            cacheSize: 1000,
            cacheTTL: 300000, // 5분
            language: 'ko',
            enableMetrics: false,
            logLevel: 'info',
            ...options
        };

        this.validateConfig();
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        this.settings[key] = value;
        if (key === 'serviceKey') this.validateConfig();
    }

    validateConfig() {
        if (!this.settings.serviceKey) {
            throw new Error('SERVICE_KEY는 필수입니다. 환경변수 또는 옵션으로 설정해주세요.');
        }

        if (this.settings.maxConcurrent <= 0) {
            throw new Error('maxConcurrent는 1 이상이어야 합니다.');
        }

        if (this.settings.timeout <= 0) {
            throw new Error('timeout은 1 이상이어야 합니다.');
        }
    }
}

// ===== 로거 =====
class Logger {
    constructor(config) {
        this.config = config;
        this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
        this.currentLevel = this.levels[config.get('logLevel')] || 1;
        this.metrics = config.get('enableMetrics') ? new Map() : null;
    }

    log(level, message, data = {}) {
        const levelIndex = this.levels[level] || 1;
        if (levelIndex < this.currentLevel) return;

        const timestamp = new Date().toISOString();
        const logData = Utils.maskSensitiveData(data);
        
        const consoleMethod = console[level] || console.log;
        if (Object.keys(logData).length > 0) {
            consoleMethod(`[${timestamp}] ${level.toUpperCase()}: ${message}`, logData);
        } else {
            consoleMethod(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
        }
    }

    debug(message, data) { this.log('debug', message, data); }
    info(message, data) { this.log('info', message, data); }
    warn(message, data) { this.log('warn', message, data); }
    error(message, data) { this.log('error', message, data); }

    metric(name, value, tags = {}) {
        if (!this.metrics) return;
        
        const key = `${name}_${JSON.stringify(tags)}`;
        if (!this.metrics.has(key)) {
            this.metrics.set(key, { count: 0, sum: 0, avg: 0 });
        }
        
        const metric = this.metrics.get(key);
        metric.count++;
        metric.sum += value;
        metric.avg = metric.sum / metric.count;
    }

    getMetrics() {
        return this.metrics ? Object.fromEntries(this.metrics) : {};
    }
}

// ===== 캐시 시스템 =====
class Cache {
    constructor(config) {
        this.maxSize = config.get('cacheSize');
        this.defaultTTL = config.get('cacheTTL');
        this.cache = new Map();
        this.accessOrder = new Map();
        this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0 };
        
        this.startCleanupTimer();
    }

    generateKey(operation, params) {
        const sortedParams = Object.keys(params).sort().reduce((obj, key) => {
            obj[key] = params[key];
            return obj;
        }, {});
        return `${operation}:${JSON.stringify(sortedParams)}`;
    }

    get(key) {
        if (this.cache.has(key)) {
            const item = this.cache.get(key);
            
            if (Date.now() - item.timestamp > item.ttl) {
                this.delete(key);
                this.stats.misses++;
                return null;
            }
            
            this.accessOrder.set(key, Date.now());
            this.stats.hits++;
            return item.data;
        }
        
        this.stats.misses++;
        return null;
    }

    set(key, data, ttl = this.defaultTTL) {
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }
        
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
        
        this.accessOrder.set(key, Date.now());
        this.stats.sets++;
    }

    delete(key) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
    }

    clear() {
        this.cache.clear();
        this.accessOrder.clear();
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
        }
    }

    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            const expiredKeys = [];
            
            for (const [key, item] of this.cache) {
                if (now - item.timestamp > item.ttl) {
                    expiredKeys.push(key);
                }
            }
            
            expiredKeys.forEach(key => this.delete(key));
        }, 60000); // 1분마다 정리
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.clear();
    }
}

// ===== 레이트 리미터 =====
class RateLimiter {
    constructor(config) {
        this.limit = config.get('rateLimitPerMinute');
        this.windowMs = 60000; // 1분
        this.requests = new Map();
        
        this.startCleanupTimer();
    }

    isAllowed(clientId = 'default') {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        
        if (!this.requests.has(clientId)) {
            this.requests.set(clientId, []);
        }
        
        const clientRequests = this.requests.get(clientId);
        
        // 윈도우 밖의 요청들 제거
        while (clientRequests.length > 0 && clientRequests[0] < windowStart) {
            clientRequests.shift();
        }
        
        if (clientRequests.length >= this.limit) {
            return false;
        }
        
        clientRequests.push(now);
        return true;
    }

    getRemaining(clientId = 'default') {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        
        if (!this.requests.has(clientId)) {
            return this.limit;
        }
        
        const clientRequests = this.requests.get(clientId);
        const validRequests = clientRequests.filter(time => time >= windowStart);
        
        return Math.max(0, this.limit - validRequests.length);
    }

    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            const windowStart = now - this.windowMs;
            
            for (const [clientId, requests] of this.requests) {
                const validRequests = requests.filter(time => time >= windowStart);
                
                if (validRequests.length === 0) {
                    this.requests.delete(clientId);
                } else {
                    this.requests.set(clientId, validRequests);
                }
            }
        }, 60000);
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.requests.clear();
    }
}

// ===== 동시성 제어 =====
class Semaphore {
    constructor(maxConcurrent) {
        this.maxConcurrent = Math.max(1, maxConcurrent);
        this.currentCount = 0;
        this.queue = [];
    }

    async acquire() {
        return new Promise((resolve) => {
            if (this.currentCount < this.maxConcurrent) {
                this.currentCount++;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }

    release() {
        this.currentCount = Math.max(0, this.currentCount - 1);
        
        if (this.queue.length > 0 && this.currentCount < this.maxConcurrent) {
            const next = this.queue.shift();
            this.currentCount++;
            next();
        }
    }

    async execute(fn) {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}

// ===== 입력 검증 =====
class Validator {
    static validateOperation(operation) {
        if (!Constants.isValidOperation(operation)) {
            throw new ValidationError(`지원하지 않는 작업: ${operation}`, 'operation', operation);
        }
    }

    static validateRequired(params, requiredFields) {
        for (const field of requiredFields) {
            if (!params[field]) {
                throw new ValidationError(`필수 필드가 누락됨: ${field}`, field, params[field]);
            }
        }
    }

    static validateContentId(contentId) {
        const id = Utils.safeParseInt(contentId);
        if (!id || id <= 0) {
            throw new ValidationError('유효하지 않은 contentId', 'contentId', contentId);
        }
        return id.toString();
    }

    static validateKeyword(keyword) {
        if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
            throw new ValidationError('키워드가 필요합니다', 'keyword', keyword);
        }
        
        const trimmed = keyword.trim();
        if (trimmed.length > 100) {
            throw new ValidationError('키워드가 너무 깁니다 (최대 100자)', 'keyword', keyword);
        }
        
        // XSS 방지
        const xssPatterns = [/<script/i, /javascript:/i, /on\w+\s*=/i];
        for (const pattern of xssPatterns) {
            if (pattern.test(trimmed)) {
                throw new ValidationError('유효하지 않은 키워드 형식', 'keyword', keyword);
            }
        }
        
        return trimmed;
    }

    static validateCoordinates(lat, lng) {
        if (!lat || !lng) return { lat: null, lng: null };
        
        const numLat = Utils.safeParseFloat(lat);
        const numLng = Utils.safeParseFloat(lng);
        
        if (isNaN(numLat) || isNaN(numLng)) {
            throw new ValidationError('유효하지 않은 좌표', 'coordinates', { lat, lng });
        }
        
        if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
            throw new ValidationError('좌표 범위 초과', 'coordinates', { lat, lng });
        }
        
        return { lat: numLat, lng: numLng };
    }

    static validatePagination(numOfRows, pageNo) {
        const rows = Utils.safeParseInt(numOfRows, 10);
        const page = Utils.safeParseInt(pageNo, 1);
        
        if (rows < 1 || rows > 1000) {
            throw new ValidationError('numOfRows는 1-1000 사이여야 합니다', 'numOfRows', numOfRows);
        }
        
        if (page < 1) {
            throw new ValidationError('pageNo는 1 이상이어야 합니다', 'pageNo', pageNo);
        }
        
        return { numOfRows: rows.toString(), pageNo: page.toString() };
    }

    static sanitizeParams(params) {
        const sanitized = {};
        
        for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined && value !== '') {
                if (typeof value === 'string') {
                    sanitized[key] = Utils.sanitizeInput(value);
                } else {
                    sanitized[key] = value;
                }
            }
        }
        
        return sanitized;
    }
}

// ===== HTTP 클라이언트 =====
class HttpClient {
    constructor(config, logger, semaphore) {
        this.config = config;
        this.logger = logger;
        this.semaphore = semaphore;
    }

    async request(operation, params) {
        return await this.semaphore.execute(async () => {
            const startTime = Date.now();
            
            try {
                const url = this.buildUrl(operation, params);
                this.logger.debug('HTTP 요청 시작', { operation, url });
                
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), this.config.get('timeout'));
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': `AllTourism/${this.config.get('version')}`
                    },
                    signal: controller.signal
                });
                
                clearTimeout(timeout);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                const responseTime = Date.now() - startTime;
                
                this.logger.debug('HTTP 요청 완료', { operation, responseTime });
                this.logger.metric('http_request_duration', responseTime, { operation, success: true });
                
                return data;
            } catch (error) {
                const responseTime = Date.now() - startTime;
                
                if (error.name === 'AbortError') {
                    this.logger.error('HTTP 요청 타임아웃', { operation, timeout: this.config.get('timeout') });
                    throw new ApiTimeoutError(this.config.get('timeout'), operation);
                }
                
                this.logger.error('HTTP 요청 실패', { operation, error: error.message });
                this.logger.metric('http_request_duration', responseTime, { operation, success: false });
                throw new TourismApiError(`HTTP 요청 실패: ${error.message}`, operation, 503);
            }
        });
    }

    buildUrl(operation, params) {
        const baseUrl = this.config.get('baseUrl');
        const serviceKey = this.config.get('serviceKey');
        
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
                url.searchParams.set(key, value);
            }
        });
        
        return url.toString();
    }
}

// ===== 지리 유틸리티 =====
class GeoUtils {
    static calculateDistance(lat1, lon1, lat2, lon2) {
        try {
            const R = 6371; // 지구 반지름 (km)
            const dLat = this.toRad(lat2 - lat1);
            const dLon = this.toRad(lon2 - lon1);
            
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                     Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                     Math.sin(dLon/2) * Math.sin(dLon/2);
            
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        } catch {
            return null;
        }
    }

    static toRad(degrees) {
        return degrees * (Math.PI / 180);
    }

    static addDistanceInfo(items, userLat, userLng, radius = null) {
        if (!items || !Array.isArray(items) || !userLat || !userLng) {
            return items;
        }

        const itemsWithDistance = items.map(item => {
            if (!item.mapx || !item.mapy) return item;

            const distance = this.calculateDistance(userLat, userLng, item.mapy, item.mapx);
            
            return {
                ...item,
                distance: distance ? Math.round(distance * 100) / 100 : null,
                distanceText: distance ? this.formatDistance(distance) : null
            };
        });

        // 반경 필터링
        let filteredItems = itemsWithDistance;
        if (radius) {
            const radiusKm = Utils.safeParseFloat(radius);
            filteredItems = itemsWithDistance.filter(item => 
                !item.distance || item.distance <= radiusKm
            );
        }

        // 거리순 정렬
        return filteredItems.sort((a, b) => {
            const distA = a.distance || 999999;
            const distB = b.distance || 999999;
            return distA - distB;
        });
    }

    static formatDistance(distance) {
        if (distance < 1) {
            return `${Math.round(distance * 1000)}m`;
        } else if (distance < 10) {
            return `${Math.round(distance * 10) / 10}km`;
        } else {
            return `${Math.round(distance)}km`;
        }
    }
}

// ===== 응답 처리 =====
class ResponseProcessor {
    static extractItems(apiResponse) {
        try {
            const body = apiResponse?.response?.body;
            if (!body) return [];

            // items.item 구조
            if (body.items?.item) {
                return Array.isArray(body.items.item) ? body.items.item : [body.items.item];
            }

            // item 구조
            if (body.item) {
                return Array.isArray(body.item) ? body.item : [body.item];
            }

            return [];
        } catch {
            return [];
        }
    }

    static processItem(item) {
        if (!item) return null;

        return {
            contentid: item.contentid,
            contenttypeid: item.contenttypeid,
            title: Utils.sanitizeHtml(item.title),
            addr1: Utils.sanitizeHtml(item.addr1),
            addr2: Utils.sanitizeHtml(item.addr2),
            zipcode: item.zipcode,
            tel: Utils.sanitizeHtml(item.tel),
            firstimage: this.validateImageUrl(item.firstimage),
            firstimage2: this.validateImageUrl(item.firstimage2),
            mapx: Utils.safeParseFloat(item.mapx) || null,
            mapy: Utils.safeParseFloat(item.mapy) || null,
            areacode: item.areacode,
            sigungucode: item.sigungucode,
            cat1: item.cat1,
            cat2: item.cat2,
            cat3: item.cat3,
            overview: Utils.sanitizeHtml(item.overview),
            homepage: Utils.sanitizeHtml(item.homepage),
            createdtime: this.formatDate(item.createdtime),
            modifiedtime: this.formatDate(item.modifiedtime),
            meta: {
                contentTypeName: Constants.getContentTypeName(item.contenttypeid),
                areaName: Constants.getAreaName(item.areacode),
                hasImage: !!(item.firstimage || item.firstimage2),
                hasCoordinates: !!(item.mapx && item.mapy)
            }
        };
    }

    static validateImageUrl(url) {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            return null;
        }
        return url;
    }

    static formatDate(dateString) {
        if (!dateString) return null;

        try {
            if (/^\d{14}$/.test(dateString)) {
                return `${dateString.substring(0, 4)}-${dateString.substring(4, 6)}-${dateString.substring(6, 8)}T${dateString.substring(8, 10)}:${dateString.substring(10, 12)}:${dateString.substring(12, 14)}`;
            }
            
            if (/^\d{8}$/.test(dateString)) {
                return `${dateString.substring(0, 4)}-${dateString.substring(4, 6)}-${dateString.substring(6, 8)}`;
            }
            
            return dateString;
        } catch {
            return dateString;
        }
    }
}

// ===== 응답 포맷터 =====
class ResponseFormatter {
    static success(operation, data, metadata = {}, performance = {}) {
        return {
            success: true,
            timestamp: new Date().toISOString(),
            operation,
            data,
            metadata: {
                operation,
                ...metadata,
                performance: {
                    totalProcessingTime: 0,
                    ...performance
                }
            }
        };
    }

    static error(error, operation = 'unknown') {
        const response = {
            success: false,
            timestamp: new Date().toISOString(),
            operation,
            error: {
                code: error.name || 'UNKNOWN_ERROR',
                message: error.message || '알 수 없는 오류가 발생했습니다',
                operation,
                statusCode: error.statusCode || 500
            }
        };

        // 개발 환경에서만 상세 정보 포함
        if (hasProcess && process.env.NODE_ENV === 'development') {
            response.error.details = error.details || {};
            response.error.stack = error.stack;
        }

        return response;
    }

    static addCacheInfo(response, fromCache, stats = {}) {
        if (response.metadata) {
            response.metadata.cache = {
                fromCache,
                ...stats,
                timestamp: new Date().toISOString()
            };
        }
        return response;
    }
}

// ===== 메인 API 클래스 =====
class AllTourismAPI {
    constructor(options = {}) {
        this.startTime = Date.now();
        this.config = new Config(options);
        this.logger = new Logger(this.config);
        this.cache = new Cache(this.config);
        this.rateLimiter = new RateLimiter(this.config);
        this.semaphore = new Semaphore(this.config.get('maxConcurrent'));
        this.httpClient = new HttpClient(this.config, this.logger, this.semaphore);
        
        this.logger.info('AllTourismAPI 초기화 완료', { 
            version: this.config.get('version'),
            environment: this.config.get('environment')
        });
    }

    async areaBasedList(params = {}) {
        const operation = 'areaBasedList';
        const startTime = Date.now();

        try {
            Validator.validateOperation(operation);
            
            if (!this.rateLimiter.isAllowed()) {
                throw new RateLimitError(
                    this.config.get('rateLimitPerMinute'),
                    this.rateLimiter.getRemaining()
                );
            }

            const sanitizedParams = Validator.sanitizeParams(params);
            const {
                numOfRows = '10', pageNo = '1', arrange = 'A',
                contentTypeId = '', areaCode = '', sigunguCode = '',
                cat1 = '', cat2 = '', cat3 = '', modifiedtime = '',
                userLat = '', userLng = '', radius = ''
            } = sanitizedParams;

            // 입력 검증
            const pagination = Validator.validatePagination(numOfRows, pageNo);
            const coordinates = Validator.validateCoordinates(userLat, userLng);

            // 캐시 키 생성 (위치 정보 제외)
            const cacheableParams = {
                numOfRows: pagination.numOfRows,
                pageNo: pagination.pageNo,
                arrange, contentTypeId, areaCode, sigunguCode,
                cat1, cat2, cat3, modifiedtime
            };

            const cacheKey = this.cache.generateKey(operation, cacheableParams);

            // 위치 정보가 없으면 캐시 확인
            if (!coordinates.lat && !coordinates.lng) {
                const cachedData = this.cache.get(cacheKey);
                if (cachedData) {
                    this.logger.metric('cache_hit', 1, { operation });
                    return ResponseFormatter.addCacheInfo(cachedData, true, this.cache.getStats());
                }
            }

            // API 요청 파라미터 구성
            const apiParams = {
                numOfRows: pagination.numOfRows,
                pageNo: pagination.pageNo,
                arrange
            };

            // 선택적 파라미터 추가
            const optionalParams = { contentTypeId, areaCode, sigunguCode, cat1, cat2, cat3, modifiedtime };
            Object.entries(optionalParams).forEach(([key, value]) => {
                if (value) apiParams[key] = value;
            });

            // API 호출
            const apiStartTime = Date.now();
            const data = await this.httpClient.request(operation, apiParams);
            const apiTime = Date.now() - apiStartTime;

            // 응답 처리
            const items = ResponseProcessor.extractItems(data);
            let processedItems = items
                .map(item => ResponseProcessor.processItem(item))
                .filter(item => item !== null);

            // 위치 기반 정보 추가
            if (coordinates.lat && coordinates.lng) {
                processedItems = GeoUtils.addDistanceInfo(
                    processedItems, 
                    coordinates.lat, 
                    coordinates.lng, 
                    radius
                );
            }

            const totalCount = Utils.safeParseInt(data.response?.body?.totalCount, processedItems.length);
            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.success(operation, {
                items: processedItems,
                pagination: {
                    totalCount,
                    pageNo: Utils.safeParseInt(pagination.pageNo),
                    numOfRows: Utils.safeParseInt(pagination.numOfRows),
                    totalPages: Math.ceil(totalCount / Utils.safeParseInt(pagination.numOfRows)),
                    hasNext: (Utils.safeParseInt(pagination.pageNo) * Utils.safeParseInt(pagination.numOfRows)) < totalCount,
                    hasPrev: Utils.safeParseInt(pagination.pageNo) > 1
                }
            }, {
                operation,
                itemCount: processedItems.length,
                hasLocationFilter: !!(coordinates.lat && coordinates.lng),
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            // 위치 정보가 없으면 캐시에 저장
            if (!coordinates.lat && !coordinates.lng) {
                this.cache.set(cacheKey, result);
            }

            this.logger.metric('api_request_success', 1, {
                operation,
                itemCount: processedItems.length,
                responseTime: totalTime
            });

            return result;
        } catch (error) {
            this.logger.error(`${operation} 오류`, { error: error.message, params });
            this.logger.metric('api_request_error', 1, { operation, error: error.name });
            return ResponseFormatter.error(error, operation);
        }
    }

    async detailCommon(params = {}) {
        const operation = 'detailCommon';
        const startTime = Date.now();

        try {
            Validator.validateOperation(operation);
            Validator.validateRequired(params, ['contentId']);
            
            if (!this.rateLimiter.isAllowed()) {
                throw new RateLimitError(
                    this.config.get('rateLimitPerMinute'),
                    this.rateLimiter.getRemaining()
                );
            }

            const contentId = Validator.validateContentId(params.contentId);
            const cacheKey = this.cache.generateKey(operation, { contentId });

            // 캐시 확인
            const cachedData = this.cache.get(cacheKey);
            if (cachedData) {
                this.logger.metric('cache_hit', 1, { operation });
                return ResponseFormatter.addCacheInfo(cachedData, true, this.cache.getStats());
            }

            // API 호출
            const apiStartTime = Date.now();
            const apiParams = {
                contentId,
                defaultYN: params.defaultYN || 'Y',
                firstImageYN: params.firstImageYN || 'Y',
                areacodeYN: params.areacodeYN || 'Y',
                catcodeYN: params.catcodeYN || 'Y',
                addrinfoYN: params.addrinfoYN || 'Y',
                mapinfoYN: params.mapinfoYN || 'Y',
                overviewYN: params.overviewYN || 'Y'
            };

            const data = await this.httpClient.request(operation, apiParams);
            const apiTime = Date.now() - apiStartTime;

            const items = ResponseProcessor.extractItems(data);
            if (items.length === 0) {
                throw new TourismApiError('데이터를 찾을 수 없습니다', operation, 404, { contentId });
            }

            const processedItem = ResponseProcessor.processItem(items[0]);
            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.success(operation, processedItem, {
                operation,
                contentId,
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            // 캐시에 저장
            this.cache.set(cacheKey, result);

            this.logger.metric('api_request_success', 1, {
                operation,
                contentId,
                responseTime: totalTime
            });

            return result;
        } catch (error) {
            this.logger.error(`${operation} 오류`, { error: error.message, params });
            this.logger.metric('api_request_error', 1, { operation, error: error.name });
            return ResponseFormatter.error(error, operation);
        }
    }

    async detailIntro(params = {}) {
        const operation = 'detailIntro';
        const startTime = Date.now();

        try {
            Validator.validateOperation(operation);
            Validator.validateRequired(params, ['contentId', 'contentTypeId']);
            
            if (!this.rateLimiter.isAllowed()) {
                throw new RateLimitError(
                    this.config.get('rateLimitPerMinute'),
                    this.rateLimiter.getRemaining()
                );
            }

            const contentId = Validator.validateContentId(params.contentId);
            const { contentTypeId } = Validator.sanitizeParams(params);
            
            const cacheKey = this.cache.generateKey(operation, { contentId, contentTypeId });

            // 캐시 확인
            const cachedData = this.cache.get(cacheKey);
            if (cachedData) {
                this.logger.metric('cache_hit', 1, { operation });
                return ResponseFormatter.addCacheInfo(cachedData, true, this.cache.getStats());
            }

            // API 호출
            const apiStartTime = Date.now();
            const data = await this.httpClient.request(operation, { contentId, contentTypeId });
            const apiTime = Date.now() - apiStartTime;

            const items = ResponseProcessor.extractItems(data);
            if (items.length === 0) {
                throw new TourismApiError('데이터를 찾을 수 없습니다', operation, 404, { contentId, contentTypeId });
            }

            const processedItem = ResponseProcessor.processItem(items[0]);
            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.success(operation, processedItem, {
                operation,
                contentId,
                contentTypeId,
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            // 캐시에 저장
            this.cache.set(cacheKey, result);

            this.logger.metric('api_request_success', 1, {
                operation,
                contentId,
                contentTypeId,
                responseTime: totalTime
            });

            return result;
        } catch (error) {
            this.logger.error(`${operation} 오류`, { error: error.message, params });
            this.logger.metric('api_request_error', 1, { operation, error: error.name });
            return ResponseFormatter.error(error, operation);
        }
    }

    async detailInfo(params = {}) {
        const operation = 'detailInfo';
        const startTime = Date.now();

        try {
            Validator.validateOperation(operation);
            Validator.validateRequired(params, ['contentId', 'contentTypeId']);
            
            if (!this.rateLimiter.isAllowed()) {
                throw new RateLimitError(
                    this.config.get('rateLimitPerMinute'),
                    this.rateLimiter.getRemaining()
                );
            }

            const contentId = Validator.validateContentId(params.contentId);
            const { contentTypeId } = Validator.sanitizeParams(params);
            
            const cacheKey = this.cache.generateKey(operation, { contentId, contentTypeId });

            // 캐시 확인
            const cachedData = this.cache.get(cacheKey);
            if (cachedData) {
                this.logger.metric('cache_hit', 1, { operation });
                return ResponseFormatter.addCacheInfo(cachedData, true, this.cache.getStats());
            }

            // API 호출
            const apiStartTime = Date.now();
            const data = await this.httpClient.request(operation, { contentId, contentTypeId });
            const apiTime = Date.now() - apiStartTime;

            const items = ResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ResponseProcessor.processItem(item)).filter(item => item !== null);
            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.success(operation, {
                items: processedItems,
                count: processedItems.length
            }, {
                operation,
                contentId,
                contentTypeId,
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            // 캐시에 저장
            this.cache.set(cacheKey, result);

            this.logger.metric('api_request_success', 1, {
                operation,
                contentId,
                contentTypeId,
                itemCount: processedItems.length,
                responseTime: totalTime
            });

            return result;
        } catch (error) {
            this.logger.error(`${operation} 오류`, { error: error.message, params });
            this.logger.metric('api_request_error', 1, { operation, error: error.name });
            return ResponseFormatter.error(error, operation);
        }
    }

    async detailImage(params = {}) {
        const operation = 'detailImage';
        const startTime = Date.now();

        try {
            Validator.validateOperation(operation);
            Validator.validateRequired(params, ['contentId']);
            
            if (!this.rateLimiter.isAllowed()) {
                throw new RateLimitError(
                    this.config.get('rateLimitPerMinute'),
                    this.rateLimiter.getRemaining()
                );
            }

            const contentId = Validator.validateContentId(params.contentId);
            const sanitizedParams = Validator.sanitizeParams(params);
            const { imageYN = 'Y', subImageYN = 'Y' } = sanitizedParams;
            
            const cacheKey = this.cache.generateKey(operation, { contentId, imageYN, subImageYN });

            // 캐시 확인
            const cachedData = this.cache.get(cacheKey);
            if (cachedData) {
                this.logger.metric('cache_hit', 1, { operation });
                return ResponseFormatter.addCacheInfo(cachedData, true, this.cache.getStats());
            }

            // API 호출
            const apiStartTime = Date.now();
            const data = await this.httpClient.request(operation, { contentId, imageYN, subImageYN });
            const apiTime = Date.now() - apiStartTime;

            const items = ResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ({
                contentid: item.contentid,
                imgname: Utils.sanitizeHtml(item.imgname),
                originimgurl: ResponseProcessor.validateImageUrl(item.originimgurl),
                smallimageurl: ResponseProcessor.validateImageUrl(item.smallimageurl),
                cpyrhtDivCd: item.cpyrhtDivCd,
                serialnum: item.serialnum
            })).filter(item => item.originimgurl || item.smallimageurl);

            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.success(operation, {
                items: processedItems,
                count: processedItems.length
            }, {
                operation,
                contentId,
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            // 캐시에 저장
            this.cache.set(cacheKey, result);

            this.logger.metric('api_request_success', 1, {
                operation,
                contentId,
                imageCount: processedItems.length,
                responseTime: totalTime
            });

            return result;
        } catch (error) {
            this.logger.error(`${operation} 오류`, { error: error.message, params });
            this.logger.metric('api_request_error', 1, { operation, error: error.name });
            return ResponseFormatter.error(error, operation);
        }
    }

    async searchKeyword(params = {}) {
        const operation = 'searchKeyword';
        const startTime = Date.now();

        try {
            Validator.validateOperation(operation);
            Validator.validateRequired(params, ['keyword']);
            
            if (!this.rateLimiter.isAllowed()) {
                throw new RateLimitError(
                    this.config.get('rateLimitPerMinute'),
                    this.rateLimiter.getRemaining()
                );
            }

            const sanitizedParams = Validator.sanitizeParams(params);
            const keyword = Validator.validateKeyword(sanitizedParams.keyword);
            
            const {
                numOfRows = '10', pageNo = '1', arrange = 'A',
                contentTypeId = '', areaCode = '', sigunguCode = '',
                userLat = '', userLng = '', radius = ''
            } = sanitizedParams;

            // 입력 검증
            const pagination = Validator.validatePagination(numOfRows, pageNo);
            const coordinates = Validator.validateCoordinates(userLat, userLng);

            // 캐시 키 생성 (위치 정보 제외)
            const cacheableParams = {
                keyword,
                numOfRows: pagination.numOfRows,
                pageNo: pagination.pageNo,
                arrange, contentTypeId, areaCode, sigunguCode
            };

            const cacheKey = this.cache.generateKey(operation, cacheableParams);

            // 위치 정보가 없으면 캐시 확인
            if (!coordinates.lat && !coordinates.lng) {
                const cachedData = this.cache.get(cacheKey);
                if (cachedData) {
                    this.logger.metric('cache_hit', 1, { operation });
                    return ResponseFormatter.addCacheInfo(cachedData, true, this.cache.getStats());
                }
            }

            // API 요청 파라미터 구성
            const apiParams = {
                keyword,
                numOfRows: pagination.numOfRows,
                pageNo: pagination.pageNo,
                arrange
            };

            // 선택적 파라미터 추가
            const optionalParams = { contentTypeId, areaCode, sigunguCode };
            Object.entries(optionalParams).forEach(([key, value]) => {
                if (value) apiParams[key] = value;
            });

            // API 호출
            const apiStartTime = Date.now();
            const data = await this.httpClient.request(operation, apiParams);
            const apiTime = Date.now() - apiStartTime;

            // 응답 처리
            const items = ResponseProcessor.extractItems(data);
            let processedItems = items
                .map(item => ResponseProcessor.processItem(item))
                .filter(item => item !== null);

            // 위치 기반 정보 추가
            if (coordinates.lat && coordinates.lng) {
                processedItems = GeoUtils.addDistanceInfo(
                    processedItems, 
                    coordinates.lat, 
                    coordinates.lng, 
                    radius
                );
            }

            const totalCount = Utils.safeParseInt(data.response?.body?.totalCount, processedItems.length);
            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.success(operation, {
                items: processedItems,
                pagination: {
                    totalCount,
                    pageNo: Utils.safeParseInt(pagination.pageNo),
                    numOfRows: Utils.safeParseInt(pagination.numOfRows),
                    totalPages: Math.ceil(totalCount / Utils.safeParseInt(pagination.numOfRows)),
                    hasNext: (Utils.safeParseInt(pagination.pageNo) * Utils.safeParseInt(pagination.numOfRows)) < totalCount,
                    hasPrev: Utils.safeParseInt(pagination.pageNo) > 1
                },
                searchQuery: {
                    keyword,
                    filters: { contentTypeId, areaCode, sigunguCode }
                }
            }, {
                operation,
                itemCount: processedItems.length,
                hasLocationFilter: !!(coordinates.lat && coordinates.lng),
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            // 위치 정보가 없으면 캐시에 저장
            if (!coordinates.lat && !coordinates.lng) {
                this.cache.set(cacheKey, result);
            }

            this.logger.metric('api_request_success', 1, {
                operation,
                keyword,
                itemCount: processedItems.length,
                responseTime: totalTime
            });

            return result;
        } catch (error) {
            this.logger.error(`${operation} 오류`, { error: error.message, params });
            this.logger.metric('api_request_error', 1, { operation, error: error.name });
            return ResponseFormatter.error(error, operation);
        }
    }

    async searchFestival(params = {}) {
        const operation = 'searchFestival';
        const startTime = Date.now();

        try {
            Validator.validateOperation(operation);
            
            if (!this.rateLimiter.isAllowed()) {
                throw new RateLimitError(
                    this.config.get('rateLimitPerMinute'),
                    this.rateLimiter.getRemaining()
                );
            }

            const sanitizedParams = Validator.sanitizeParams(params);
            const {
                numOfRows = '10', pageNo = '1', arrange = 'A',
                eventStartDate = '', eventEndDate = '',
                areaCode = '', sigunguCode = '',
                userLat = '', userLng = '', radius = ''
            } = sanitizedParams;

            // 입력 검증
            const pagination = Validator.validatePagination(numOfRows, pageNo);
            const coordinates = Validator.validateCoordinates(userLat, userLng);

            // 캐시 키 생성 (위치 정보 제외)
            const cacheableParams = {
                numOfRows: pagination.numOfRows,
                pageNo: pagination.pageNo,
                arrange, eventStartDate, eventEndDate, areaCode, sigunguCode
            };

            const cacheKey = this.cache.generateKey(operation, cacheableParams);

            // 위치 정보가 없으면 캐시 확인
            if (!coordinates.lat && !coordinates.lng) {
                const cachedData = this.cache.get(cacheKey);
                if (cachedData) {
                    this.logger.metric('cache_hit', 1, { operation });
                    return ResponseFormatter.addCacheInfo(cachedData, true, this.cache.getStats());
                }
            }

            // API 요청 파라미터 구성
            const apiParams = {
                numOfRows: pagination.numOfRows,
                pageNo: pagination.pageNo,
                arrange
            };

            // 선택적 파라미터 추가
            const optionalParams = { eventStartDate, eventEndDate, areaCode, sigunguCode };
            Object.entries(optionalParams).forEach(([key, value]) => {
                if (value) apiParams[key] = value;
            });

            // API 호출
            const apiStartTime = Date.now();
            const data = await this.httpClient.request(operation, apiParams);
            const apiTime = Date.now() - apiStartTime;

            // 응답 처리
            const items = ResponseProcessor.extractItems(data);
            let processedItems = items
                .map(item => ResponseProcessor.processItem(item))
                .filter(item => item !== null);

            // 위치 기반 정보 추가
            if (coordinates.lat && coordinates.lng) {
                processedItems = GeoUtils.addDistanceInfo(
                    processedItems, 
                    coordinates.lat, 
                    coordinates.lng, 
                    radius
                );
            }

            const totalCount = Utils.safeParseInt(data.response?.body?.totalCount, processedItems.length);
            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.success(operation, {
                items: processedItems,
                pagination: {
                    totalCount,
                    pageNo: Utils.safeParseInt(pagination.pageNo),
                    numOfRows: Utils.safeParseInt(pagination.numOfRows),
                    totalPages: Math.ceil(totalCount / Utils.safeParseInt(pagination.numOfRows)),
                    hasNext: (Utils.safeParseInt(pagination.pageNo) * Utils.safeParseInt(pagination.numOfRows)) < totalCount,
                    hasPrev: Utils.safeParseInt(pagination.pageNo) > 1
                },
                searchQuery: {
                    filters: { eventStartDate, eventEndDate, areaCode, sigunguCode }
                }
            }, {
                operation,
                itemCount: processedItems.length,
                hasLocationFilter: !!(coordinates.lat && coordinates.lng),
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            // 위치 정보가 없으면 캐시에 저장
            if (!coordinates.lat && !coordinates.lng) {
                this.cache.set(cacheKey, result);
            }

            this.logger.metric('api_request_success', 1, {
                operation,
                itemCount: processedItems.length,
                responseTime: totalTime
            });

            return result;
        } catch (error) {
            this.logger.error(`${operation} 오류`, { error: error.message, params });
            this.logger.metric('api_request_error', 1, { operation, error: error.name });
            return ResponseFormatter.error(error, operation);
        }
    }

    async locationBasedList(params = {}) {
        const operation = 'locationBasedList';
        const startTime = Date.now();

        try {
            Validator.validateOperation(operation);
            Validator.validateRequired(params, ['mapX', 'mapY']);
            
            if (!this.rateLimiter.isAllowed()) {
                throw new RateLimitError(
                    this.config.get('rateLimitPerMinute'),
                    this.rateLimiter.getRemaining()
                );
            }

            const sanitizedParams = Validator.sanitizeParams(params);
            const coordinates = Validator.validateCoordinates(sanitizedParams.mapY, sanitizedParams.mapX);
            
            if (!coordinates.lat || !coordinates.lng) {
                throw new ValidationError('유효한 좌표가 필요합니다', 'coordinates', { mapX: sanitizedParams.mapX, mapY: sanitizedParams.mapY });
            }

            const {
                numOfRows = '10', pageNo = '1', arrange = 'A',
                contentTypeId = '', radius = '1000'
            } = sanitizedParams;

            // 입력 검증
            const pagination = Validator.validatePagination(numOfRows, pageNo);
            const radiusValue = Utils.safeParseInt(radius, 1000);

            // API 요청 파라미터 구성
            const apiParams = {
                mapX: coordinates.lng.toString(),
                mapY: coordinates.lat.toString(),
                radius: radiusValue.toString(),
                numOfRows: pagination.numOfRows,
                pageNo: pagination.pageNo,
                arrange
            };

            if (contentTypeId) apiParams.contentTypeId = contentTypeId;

            // API 호출
            const apiStartTime = Date.now();
            const data = await this.httpClient.request(operation, apiParams);
            const apiTime = Date.now() - apiStartTime;

            // 응답 처리
            const items = ResponseProcessor.extractItems(data);
            let processedItems = items
                .map(item => ResponseProcessor.processItem(item))
                .filter(item => item !== null);

            // 거리 정보 추가
            processedItems = GeoUtils.addDistanceInfo(
                processedItems,
                coordinates.lat,
                coordinates.lng
            );

            const totalCount = Utils.safeParseInt(data.response?.body?.totalCount, processedItems.length);
            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.success(operation, {
                items: processedItems,
                pagination: {
                    totalCount,
                    pageNo: Utils.safeParseInt(pagination.pageNo),
                    numOfRows: Utils.safeParseInt(pagination.numOfRows),
                    totalPages: Math.ceil(totalCount / Utils.safeParseInt(pagination.numOfRows)),
                    hasNext: (Utils.safeParseInt(pagination.pageNo) * Utils.safeParseInt(pagination.numOfRows)) < totalCount,
                    hasPrev: Utils.safeParseInt(pagination.pageNo) > 1
                },
                searchQuery: {
                    location: { lat: coordinates.lat, lng: coordinates.lng },
                    radius: radiusValue,
                    filters: { contentTypeId }
                }
            }, {
                operation,
                itemCount: processedItems.length,
                centerLocation: { lat: coordinates.lat, lng: coordinates.lng },
                searchRadius: radiusValue,
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            this.logger.metric('api_request_success', 1, {
                operation,
                itemCount: processedItems.length,
                responseTime: totalTime
            });

            return result;
        } catch (error) {
            this.logger.error(`${operation} 오류`, { error: error.message, params });
            this.logger.metric('api_request_error', 1, { operation, error: error.name });
            return ResponseFormatter.error(error, operation);
        }
    }

    async areaCode(params = {}) {
        const operation = 'areaCode';
        const startTime = Date.now();

        try {
            Validator.validateOperation(operation);
            
            if (!this.rateLimiter.isAllowed()) {
                throw new RateLimitError(
                    this.config.get('rateLimitPerMinute'),
                    this.rateLimiter.getRemaining()
                );
            }

            const sanitizedParams = Validator.sanitizeParams(params);
            const { areaCode = '', numOfRows = '100', pageNo = '1' } = sanitizedParams;

            const cacheKey = this.cache.generateKey(operation, { areaCode, numOfRows, pageNo });

            // 캐시 확인
            const cachedData = this.cache.get(cacheKey);
            if (cachedData) {
                this.logger.metric('cache_hit', 1, { operation });
                return ResponseFormatter.addCacheInfo(cachedData, true, this.cache.getStats());
            }

            // API 호출
            const apiStartTime = Date.now();
            const data = await this.httpClient.request(operation, { areaCode, numOfRows, pageNo });
            const apiTime = Date.now() - apiStartTime;

            const items = ResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ({
                code: item.code,
                name: Utils.sanitizeHtml(item.name),
                rnum: item.rnum
            }));

            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.success(operation, {
                items: processedItems,
                count: processedItems.length
            }, {
                operation,
                areaCode,
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            // 캐시에 저장 (지역코드는 자주 변경되지 않으므로 긴 TTL)
            this.cache.set(cacheKey, result, 3600000); // 1시간

            this.logger.metric('api_request_success', 1, {
                operation,
                itemCount: processedItems.length,
                responseTime: totalTime
            });

            return result;
        } catch (error) {
            this.logger.error(`${operation} 오류`, { error: error.message, params });
            this.logger.metric('api_request_error', 1, { operation, error: error.name });
            return ResponseFormatter.error(error, operation);
        }
    }

    async categoryCode(params = {}) {
        const operation = 'categoryCode';
        const startTime = Date.now();

        try {
            Validator.validateOperation(operation);
            
            if (!this.rateLimiter.isAllowed()) {
                throw new RateLimitError(
                    this.config.get('rateLimitPerMinute'),
                    this.rateLimiter.getRemaining()
                );
            }

            const sanitizedParams = Validator.sanitizeParams(params);
            const { contentTypeId = '', cat1 = '', cat2 = '', numOfRows = '100', pageNo = '1' } = sanitizedParams;

            const cacheKey = this.cache.generateKey(operation, { contentTypeId, cat1, cat2, numOfRows, pageNo });

            // 캐시 확인
            const cachedData = this.cache.get(cacheKey);
            if (cachedData) {
                this.logger.metric('cache_hit', 1, { operation });
                return ResponseFormatter.addCacheInfo(cachedData, true, this.cache.getStats());
            }

            // API 파라미터 구성
            const apiParams = { numOfRows, pageNo };
            if (contentTypeId) apiParams.contentTypeId = contentTypeId;
            if (cat1) apiParams.cat1 = cat1;
            if (cat2) apiParams.cat2 = cat2;

            // API 호출
            const apiStartTime = Date.now();
            const data = await this.httpClient.request(operation, apiParams);
            const apiTime = Date.now() - apiStartTime;

            const items = ResponseProcessor.extractItems(data);
            const processedItems = items.map(item => ({
                code: item.code,
                name: Utils.sanitizeHtml(item.name),
                rnum: item.rnum
            }));

            const totalTime = Date.now() - startTime;

            const result = ResponseFormatter.success(operation, {
                items: processedItems,
                count: processedItems.length
            }, {
                operation,
                contentTypeId,
                cat1,
                cat2,
                apiResponseCode: data.response?.header?.resultCode
            }, {
                apiResponseTime: apiTime,
                totalProcessingTime: totalTime
            });

            // 캐시에 저장 (카테고리 코드는 자주 변경되지 않으므로 긴 TTL)
            this.cache.set(cacheKey, result, 3600000); // 1시간

            this.logger.metric('api_request_success', 1, {
                operation,
                itemCount: processedItems.length,
                responseTime: totalTime
            });

            return result;
        } catch (error) {
            this.logger.error(`${operation} 오류`, { error: error.message, params });
            this.logger.metric('api_request_error', 1, { operation, error: error.name });
            return ResponseFormatter.error(error, operation);
        }
    }

    // ===== 유틸리티 메서드들 =====

    getSystemStatus() {
        try {
            return {
                success: true,
                timestamp: new Date().toISOString(),
                system: {
                    version: this.config.get('version'),
                    environment: this.config.get('environment'),
                    uptime: Date.now() - this.startTime,
                    memoryUsage: hasProcess && process.memoryUsage ? process.memoryUsage() : null
                },
                cache: this.cache.getStats(),
                rateLimiter: {
                    limit: this.config.get('rateLimitPerMinute'),
                    remaining: this.rateLimiter.getRemaining()
                },
                metrics: this.logger.getMetrics()
            };
        } catch (error) {
            return ResponseFormatter.error(error, 'getSystemStatus');
        }
    }

    clearCache() {
        try {
            this.cache.clear();
            this.logger.info('캐시가 초기화되었습니다');
            return { success: true, message: '캐시가 성공적으로 초기화되었습니다' };
        } catch (error) {
            return ResponseFormatter.error(error, 'clearCache');
        }
    }

    setConfig(key, value) {
        try {
            this.config.set(key, value);
            this.logger.info('설정이 업데이트되었습니다', { key, value: Utils.maskSensitiveData({ [key]: value }) });
            return { success: true, message: `설정 ${key}이(가) 업데이트되었습니다` };
        } catch (error) {
            return ResponseFormatter.error(error, 'setConfig');
        }
    }

    getConfig(key = null) {
        try {
            if (key) {
                return { success: true, config: { [key]: this.config.get(key) } };
            } else {
                return { success: true, config: Utils.maskSensitiveData(this.config.settings) };
            }
        } catch (error) {
            return ResponseFormatter.error(error, 'getConfig');
        }
    }

    destroy() {
        try {
            this.cache.destroy();
            this.rateLimiter.destroy();
            this.logger.info('AllTourismAPI 인스턴스가 정리되었습니다');
            return { success: true, message: 'API 인스턴스가 성공적으로 정리되었습니다' };
        } catch (error) {
            console.error('API 인스턴스 정리 중 오류:', error);
            return { success: false, error: error.message };
        }
    }
}

// ===== 모듈 내보내기 =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        AllTourismAPI, 
        TourismApiError, 
        ValidationError, 
        ApiTimeoutError, 
        RateLimitError,
        Constants,
        Utils,
        GeoUtils
    };
} else if (typeof window !== 'undefined') {
    window.AllTourismAPI = AllTourismAPI;
    window.TourismApiError = TourismApiError;
    window.ValidationError = ValidationError;
    window.ApiTimeoutError = ApiTimeoutError;
    window.RateLimitError = RateLimitError;
    window.Constants = Constants;
    window.Utils = Utils;
    window.GeoUtils = GeoUtils;
}
