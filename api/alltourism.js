// alltourism.js - 관광JS 통합 완성판
// 모든 기능이 하나의 파일에 통합되어 있습니다.

const API_KEY = process.env.TOURISM_API_KEY; // 환경변수에서 API 키 가져오기

// ========================================
// 1. 기본 유틸리티 클래스들
// ========================================

// 에러 클래스
class ApiError extends Error {
    constructor(message, code = 'API_ERROR') {
        super(message);
        this.name = 'ApiError';
        this.code = code;
    }
}

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        this.code = 'VALIDATION_ERROR';
    }
}

class SecurityError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'SecurityError';
        this.code = code;
        this.statusCode = 403;
    }
}

// ========================================
// 2. TourAPI 클라이언트
// ========================================

class TourAPIClient {
    constructor() {
        this.baseUrl = 'https://apis.data.go.kr/B551011/KorService2';
        this.defaultTimeout = 10000;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        
        console.log('🌐 TourAPI 클라이언트 초기화');
    }

    async fetchWithRetry(url, options = {}, retries = this.maxRetries) {
        const requestOptions = {
            timeout: this.defaultTimeout,
            headers: {
                'User-Agent': 'TourismJS/1.0 (Tourism Information Service)',
                'Accept': 'application/json',
                ...options.headers
            },
            ...options
        };

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`🌐 API 호출 시도 ${attempt}/${retries}: ${this.maskApiKey(url)}`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), requestOptions.timeout);
                
                const response = await fetch(url, {
                    ...requestOptions,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                console.log(`✅ API 호출 성공: ${response.status}`);
                return response;

            } catch (error) {
                console.error(`❌ API 호출 실패 (${attempt}/${retries}):`, error.message);
                
                if (attempt === retries) {
                    throw new Error(`API 호출 최종 실패: ${error.message}`);
                }
                
                await this.delay(this.retryDelay * attempt);
            }
        }
    }

    validateApiResponse(data, operation) {
        const resultCode = data.resultCode || data.response?.header?.resultCode;
        
        if (resultCode !== '0' && resultCode !== '0000') {
            const errorMessage = data.response?.header?.resultMsg || 
                               data.resultMsg || 
                               '알 수 없는 API 오류';
            throw new ApiError(`${operation} API 오류: ${errorMessage}`, resultCode);
        }

        if (!data.response?.body) {
            throw new ApiError(`${operation} API 응답에 데이터가 없습니다`, 'NO_DATA');
        }

        return true;
    }

    extractItems(data) {
        const items = data.response?.body?.items?.item || 
                     data.items?.item || [];
        return Array.isArray(items) ? items : items ? [items] : [];
    }

    extractSingleItem(data) {
        const items = this.extractItems(data);
        if (items.length === 0) {
            throw new ApiError('데이터를 찾을 수 없습니다', 'NO_DATA');
        }
        return items[0];
    }

    buildUrl(endpoint, params) {
        const url = new URL(endpoint, this.baseUrl);
        
        url.searchParams.set('MobileOS', 'ETC');
        url.searchParams.set('MobileApp', 'TourismJS');
        url.searchParams.set('_type', 'json');
        
        for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined && value !== '') {
                url.searchParams.set(key, value);
            }
        }
        
        return url.toString();
    }

    maskApiKey(url) {
        return url.replace(/serviceKey=[^&]+/, 'serviceKey=***');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ========================================
// 3. 간단한 캐시 매니저
// ========================================

class SimpleCacheManager {
    constructor() {
        this.cache = new Map();
        this.stats = { hits: 0, misses: 0 };
        this.maxSize = 100;
        this.defaultTTL = 3600000; // 1시간
        
        console.log('💾 간단한 캐시 매니저 초기화');
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            this.stats.misses++;
            return null;
        }

        if (Date.now() > item.expires) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return item.data;
    }

    set(key, data, ttlSeconds = null) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        const ttl = ttlSeconds ? ttlSeconds * 1000 : this.defaultTTL;
        this.cache.set(key, {
            data,
            expires: Date.now() + ttl,
            created: Date.now()
        });
    }

    generateKey(prefix, params) {
        const sortedParams = Object.keys(params)
            .sort()
            .map(key => `${key}:${params[key]}`)
            .join('|');
        
        const hash = this.simpleHash(sortedParams);
        return `${prefix}:${hash}`;
    }

    simpleHash(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        return Math.abs(hash).toString(36);
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;
        
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: `${hitRate}%`
        };
    }
}

// ========================================
// 4. 보안 시스템 (간단 버전)
// ========================================

class SimpleSecurity {
    constructor() {
        this.allowedDomains = new Set([
            'localhost', 'vercel.app', 'netlify.app', 'github.io',
            'tistory.com', 'blog.naver.com', 'brunch.co.kr'
        ]);
        
        this.rateLimitMap = new Map();
        this.config = {
            maxRequestsPerMinute: 60,
            maxRequestsPerHour: 1000
        };
        
        console.log('🔐 간단한 보안 시스템 초기화');
    }

    async validateRequest(req) {
        const clientIP = this.getClientIP(req);
        const referer = req.headers?.referer || req.headers?.origin || '';
        
        // 도메인 검증 (관대하게)
        if (referer) {
            const domain = this.extractDomain(referer);
            const isAllowed = this.allowedDomains.has(domain) || 
                             [...this.allowedDomains].some(allowed => domain.includes(allowed));
                             
            if (!isAllowed) {
                console.log(`⚠️ 허용되지 않은 도메인: ${domain} (하지만 허용)`);
                // 경고만 하고 차단하지는 않음
            }
        }

        // 기본 Rate Limiting
        await this.checkRateLimit(clientIP);
        
        // 기본 입력 정화
        const sanitizedParams = this.basicSanitize(
            req.method === 'GET' ? req.query : req.body
        );
        
        return {
            valid: true,
            sanitizedParams,
            clientIP,
            domain: this.extractDomain(referer) || 'unknown',
            riskLevel: 'low'
        };
    }

    async checkRateLimit(clientIP) {
        const now = Date.now();
        const minute = Math.floor(now / 60000);
        
        const record = this.rateLimitMap.get(clientIP) || { minute: { time: minute, count: 0 } };

        if (record.minute.time === minute) {
            record.minute.count++;
        } else {
            record.minute = { time: minute, count: 1 };
        }

        this.rateLimitMap.set(clientIP, record);

        if (record.minute.count > this.config.maxRequestsPerMinute) {
            throw new SecurityError('요청이 너무 많습니다', 'RATE_LIMITED');
        }

        return { remaining: this.config.maxRequestsPerMinute - record.minute.count };
    }

    basicSanitize(params) {
        if (!params || typeof params !== 'object') {
            return params;
        }

        const sanitized = {};
        
        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string') {
                sanitized[key] = value
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/javascript:/gi, '')
                    .trim();
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    getClientIP(req) {
        return req.headers?.['x-forwarded-for'] || 
               req.headers?.['x-real-ip'] || 
               req.connection?.remoteAddress || 
               'unknown';
    }

    extractDomain(url) {
        if (!url) return 'unknown';
        
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.toLowerCase();
        } catch {
            return 'invalid';
        }
    }
}

// ========================================
// 5. 검색 엔진
// ========================================

class SearchEngine {
    constructor() {
        this.apiClient = new TourAPIClient();
        this.cache = new SimpleCacheManager();
        console.log('🔍 검색 엔진 초기화 완료');
    }

    async executeKeywordSearch(apiKey, params) {
        const { query, numOfRows = 10, pageNo = 1 } = params;
        
        const cacheKey = this.cache.generateKey('keyword', { query, numOfRows, pageNo });
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return { ...cached, fromCache: true };
        }

        let url = `${this.apiClient.baseUrl}/searchKeyword2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=TourismJS&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&keyword=${encodeURIComponent(query)}`;
        
        if (params.areaCode) url += `&areaCode=${params.areaCode}`;
        if (params.contentTypeId) url += `&contentTypeId=${params.contentTypeId}`;

        const response = await this.apiClient.fetchWithRetry(url);
        const data = await response.json();
        
        this.apiClient.validateApiResponse(data, 'searchKeyword');
        
        const items = this.apiClient.extractItems(data);
        const processedItems = items.map(item => this.processBasicItem(item));
        
        const result = {
            items: processedItems,
            totalCount: data.response?.body?.totalCount || processedItems.length,
            source: 'keyword'
        };
        
        this.cache.set(cacheKey, result, 1800);
        return result;
    }

    async executeLocationSearch(apiKey, params) {
        const { lat, lng, radius = 1000, numOfRows = 10, pageNo = 1 } = params;
        
        const cacheKey = this.cache.generateKey('location', { lat, lng, radius, numOfRows, pageNo });
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return { ...cached, fromCache: true };
        }

        let url = `${this.apiClient.baseUrl}/locationBasedList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=TourismJS&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=E&mapX=${lng}&mapY=${lat}&radius=${radius}`;
        
        if (params.contentTypeId) url += `&contentTypeId=${params.contentTypeId}`;

        const response = await this.apiClient.fetchWithRetry(url);
        const data = await response.json();
        
        this.apiClient.validateApiResponse(data, 'locationBasedList');
        
        const items = this.apiClient.extractItems(data);
        const processedItems = items.map(item => ({
            ...this.processBasicItem(item),
            distance: parseFloat(item.dist) || null
        }));
        
        const result = {
            items: processedItems,
            totalCount: data.response?.body?.totalCount || processedItems.length,
            source: 'location',
            searchCenter: { lat: parseFloat(lat), lng: parseFloat(lng), radius }
        };
        
        this.cache.set(cacheKey, result, 1800);
        return result;
    }

    processBasicItem(item) {
        return {
            contentId: item.contentid,
            contentTypeId: item.contenttypeid,
            title: item.title,
            addr1: item.addr1 || null,
            addr2: item.addr2 || null,
            tel: item.tel || null,
            firstimage: item.firstimage || null,
            firstimage2: item.firstimage2 || null,
            mapx: parseFloat(item.mapx) || null,
            mapy: parseFloat(item.mapy) || null,
            areacode: item.areacode || null,
            sigungucode: item.sigungucode || null,
            cat1: item.cat1 || null,
            cat2: item.cat2 || null,
            cat3: item.cat3 || null,
            readcount: parseInt(item.readcount) || 0,
            modifiedtime: item.modifiedtime || null,
            overview: item.overview || null,
            typeName: this.getContentTypeName(item.contenttypeid)
        };
    }

    getContentTypeName(contentTypeId) {
        const typeMap = {
            '12': '관광지',
            '14': '문화시설',
            '15': '축제/공연/행사',
            '25': '여행코스',
            '28': '레포츠',
            '32': '숙박',
            '38': '쇼핑',
            '39': '음식점'
        };
        return typeMap[contentTypeId] || '기타';
    }
}

// ========================================
// 6. 상세정보 엔진
// ========================================

class DetailEngine {
    constructor() {
        this.apiClient = new TourAPIClient();
        this.cache = new SimpleCacheManager();
        console.log('📊 상세정보 엔진 초기화 완료');
    }

    async fetchDetailCommon(apiKey, contentId) {
        const cacheKey = this.cache.generateKey('detail-common', { contentId });
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return { ...cached, fromCache: true };
        }

        const url = this.apiClient.buildUrl('/detailCommon2', {
            serviceKey: apiKey,
            contentId
        });

        const response = await this.apiClient.fetchWithRetry(url);
        const data = await response.json();
        
        this.apiClient.validateApiResponse(data, 'detailCommon');
        const result = this.apiClient.extractSingleItem(data);
        
        this.cache.set(cacheKey, result, 3600);
        return result;
    }

    async fetchDetailIntro(apiKey, contentId, contentTypeId) {
        const cacheKey = this.cache.generateKey('detail-intro', { contentId, contentTypeId });
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return { ...cached, fromCache: true };
        }

        const url = this.apiClient.buildUrl('/detailIntro2', {
            serviceKey: apiKey,
            contentId,
            contentTypeId
        });

        const response = await this.apiClient.fetchWithRetry(url);
        const data = await response.json();
        
        this.apiClient.validateApiResponse(data, 'detailIntro');
        const result = this.apiClient.extractSingleItem(data);
        
        this.cache.set(cacheKey, result, 3600);
        return result;
    }

    async fetchDetailImages(apiKey, contentId) {
        const cacheKey = this.cache.generateKey('detail-images', { contentId });
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return { ...cached, fromCache: true };
        }

        const url = this.apiClient.buildUrl('/detailImage2', {
            serviceKey: apiKey,
            contentId,
            imageYN: 'Y'
        });

        const response = await this.apiClient.fetchWithRetry(url);
        const data = await response.json();
        
        this.apiClient.validateApiResponse(data, 'detailImage');
        const result = this.apiClient.extractItems(data);
        
        this.cache.set(cacheKey, result, 3600);
        return result;
    }

    async collectAllDetails(apiKey, contentId) {
        console.log(`📊 상세정보 수집 시작: ${contentId}`);
        
        const startTime = Date.now();
        
        try {
            // 1단계: 기본 정보
            const commonData = await this.fetchDetailCommon(apiKey, contentId);
            const contentTypeId = commonData.contenttypeid;
            
            console.log(`📋 콘텐츠 타입: ${contentTypeId}`);

            // 2단계: 병렬로 추가 정보 수집
            const [introResult, imageResult] = await Promise.allSettled([
                this.fetchDetailIntro(apiKey, contentId, contentTypeId),
                this.fetchDetailImages(apiKey, contentId)
            ]);

            // 3단계: 결과 구조화
            const detailData = {
                common: this.processCommonData(commonData),
                intro: introResult.status === 'fulfilled' ? 
                    this.processIntroData(contentTypeId, introResult.value) : null,
                images: imageResult.status === 'fulfilled' ? 
                    this.processImageData(imageResult.value) : [],
                meta: {
                    contentId,
                    contentTypeId,
                    typeName: this.getContentTypeName(contentTypeId),
                    collectedAt: new Date().toISOString(),
                    collectionTime: Date.now() - startTime
                }
            };

            console.log(`✅ 상세정보 수집 완료: ${Date.now() - startTime}ms`);
            return detailData;

        } catch (error) {
            console.error(`❌ 상세정보 수집 실패: ${contentId}`, error);
            throw error;
        }
    }

    processCommonData(commonData) {
        return {
            contentId: commonData.contentid,
            contentTypeId: commonData.contenttypeid,
            title: commonData.title,
            overview: this.cleanHtmlContent(commonData.overview),
            location: {
                address: {
                    main: commonData.addr1,
                    detail: commonData.addr2,
                    full: `${commonData.addr1}${commonData.addr2 ? ' ' + commonData.addr2 : ''}`
                },
                coordinates: commonData.mapx && commonData.mapy ? {
                    lng: parseFloat(commonData.mapx),
                    lat: parseFloat(commonData.mapy)
                } : null
            },
            contact: {
                tel: commonData.tel,
                homepage: this.cleanHtmlContent(commonData.homepage)
            },
            media: {
                primaryImage: commonData.firstimage,
                thumbnailImage: commonData.firstimage2
            },
            metadata: {
                created: commonData.createdtime,
                modified: commonData.modifiedtime,
                readCount: parseInt(commonData.readcount) || 0,
                typeName: this.getContentTypeName(commonData.contenttypeid)
            }
        };
    }

    processIntroData(contentTypeId, introData) {
        if (!introData) return null;

        const base = {
            contentId: introData.contentid,
            contentTypeId: introData.contenttypeid,
            type: this.getContentTypeName(contentTypeId)
        };

        // 타입별 특화 처리 (간단 버전)
        if (contentTypeId === '12') { // 관광지
            return {
                ...base,
                facilities: {
                    parking: introData.parking,
                    pet: introData.chkpet === '1',
                    creditCard: introData.chkcreditcard === '1'
                },
                operation: {
                    hours: introData.usetime,
                    restDays: introData.restdate
                }
            };
        } else if (contentTypeId === '39') { // 음식점
            return {
                ...base,
                restaurant: {
                    menu: {
                        signature: introData.firstmenu
                    },
                    facilities: {
                        parking: introData.parkingfood,
                        creditCard: introData.chkcreditcardfood === '1'
                    },
                    hours: {
                        operating: introData.opentimefood,
                        closed: introData.restdatefood
                    }
                }
            };
        }

        return base;
    }

    processImageData(imageData) {
        if (!imageData || !Array.isArray(imageData)) return [];

        return imageData.map((image, index) => ({
            id: index + 1,
            contentId: image.contentid,
            originalUrl: image.originimgurl,
            smallUrl: image.smallimageurl,
            name: image.imgname,
            isPrimary: index === 0
        }));
    }

    cleanHtmlContent(html) {
        if (!html) return null;
        return html
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim();
    }

    getContentTypeName(contentTypeId) {
        const typeMap = {
            '12': '관광지',
            '14': '문화시설',
            '15': '축제/공연/행사',
            '25': '여행코스',
            '28': '레포츠',
            '32': '숙박',
            '38': '쇼핑',
            '39': '음식점'
        };
        return typeMap[contentTypeId] || '기타';
    }
}

// ========================================
// 7. 메인 관광 시스템
// ========================================

class TourismSystem {
    constructor() {
        this.security = new SimpleSecurity();
        this.searchEngine = new SearchEngine();
        this.detailEngine = new DetailEngine();
        this.cache = new SimpleCacheManager();
        
        console.log('🎯 관광 시스템 초기화 완료');
    }

    async processRequest(operation, params, context = {}) {
        const startTime = Date.now();
        
        try {
            // API 키 확인
            if (!API_KEY) {
                throw new Error('TOURISM_API_KEY 환경변수가 설정되지 않았습니다');
            }

            console.log(`🎯 요청 처리 시작: ${operation}`);

            let result;
            
            switch (operation) {
                case 'masterSearch':
                case 'search':
                    result = await this.handleSearch(params);
                    break;
                    
                case 'ultimateDetail':
                case 'detail':
                    result = await this.handleDetail(params);
                    break;
                    
                case 'locationSearch':
                    result = await this.handleLocationSearch(params);
                    break;
                    
                default:
                    throw new Error(`지원하지 않는 오퍼레이션: ${operation}`);
            }

            const totalTime = Date.now() - startTime;

            return {
                success: true,
                operation,
                data: result,
                metadata: {
                    performance: {
                        totalTime,
                        timestamp: new Date().toISOString()
                    },
                    cache: this.cache.getStats(),
                    version: '1.0.0'
                }
            };

        } catch (error) {
            console.error('🚨 요청 처리 오류:', error);
            
            return {
                success: false,
                operation,
                error: {
                    message: error.message,
                    code: error.code || 'UNKNOWN_ERROR'
                },
                metadata: {
                    performance: {
                        totalTime: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }
                }
            };
        }
    }

    async handleSearch(params) {
        const { query, type = 'keyword', numOfRows = 10 } = params;
        
        if (!query) {
            throw new ValidationError('검색 키워드가 필요합니다');
        }

        console.log(`🔍 검색 실행: "${query}" (타입: ${type})`);
        
        let searchResult;
        
        if (type === 'location' && params.lat && params.lng) {
            searchResult = await this.searchEngine.executeLocationSearch(API_KEY, {
                lat: params.lat,
                lng: params.lng,
                radius: params.radius || 1000,
                numOfRows
            });
        } else {
            searchResult = await this.searchEngine.executeKeywordSearch(API_KEY, {
                query,
                numOfRows,
                areaCode: params.areaCode,
                contentTypeId: params.contentTypeId
            });
        }

        return {
            items: searchResult.items,
            searchInfo: {
                query,
                type,
                totalFound: searchResult.totalCount,
                source: searchResult.source,
                fromCache: searchResult.fromCache || false
            }
        };
    }

    async handleDetail(params) {
        const { contentId } = params;
        
        if (!contentId) {
            throw new ValidationError('상세정보 조회에는 contentId가 필요합니다');
        }

        console.log(`📊 상세정보 조회: ${contentId}`);
        
        const detailResult = await this.detailEngine.collectAllDetails(API_KEY, contentId);
        
        // 간단한 완성도 계산
        const completeness = this.calculateCompleteness(detailResult);
        
        return {
            ...detailResult,
            analysis: {
                completeness: {
                    overall: {
                        percentage: completeness,
                        grade: this.getGrade(completeness)
                    }
                }
            }
        };
    }

    async handleLocationSearch(params) {
        const { lat, lng, radius = 1000 } = params;
        
        if (!lat || !lng) {
            throw new ValidationError('위치 검색에는 lat, lng가 필요합니다');
        }

        console.log(`📍 위치 검색: (${lat}, ${lng}) 반경 ${radius}m`);
        
        const locationResult = await this.searchEngine.executeLocationSearch(API_KEY, {
            lat,
            lng,
            radius,
            numOfRows: params.numOfRows || 10
        });

        return {
            items: locationResult.items,
            searchCenter: locationResult.searchCenter,
            searchInfo: {
                type: 'location',
                totalFound: locationResult.totalCount,
                fromCache: locationResult.fromCache || false
            }
        };
    }

    calculateCompleteness(detailData) {
        let score = 0;
        
        if (detailData.common?.title) score += 20;
        if (detailData.common?.overview) score += 30;
        if (detailData.common?.location?.coordinates) score += 15;
        if (detailData.common?.contact?.tel) score += 10;
        if (detailData.intro) score += 15;
        if (detailData.images?.length > 0) score += 10;
        
        return Math.min(100, score);
    }

    getGrade(percentage) {
        if (percentage >= 90) return 'A+';
        if (percentage >= 80) return 'A';
        if (percentage >= 70) return 'B+';
        if (percentage >= 60) return 'B';
        if (percentage >= 50) return 'C';
        return 'D';
    }
}

// ========================================
// 8. 테스트 함수들
// ========================================

async function testTourismSystem() {
    console.log('🧪 관광 시스템 테스트 시작\n');
    
    if (!API_KEY) {
        console.error('❌ TOURISM_API_KEY 환경변수가 설정되지 않았습니다');
        console.log('💡 해결방법: export TOURISM_API_KEY="your_api_key_here"');
        return;
    }

    const tourism = new TourismSystem();
    
    try {
        // 1. 검색 테스트
        console.log('🔍 1. 검색 테스트 (경복궁)');
        const searchResult = await tourism.processRequest('masterSearch', {
            query: '경복궁',
            numOfRows: 3
        });
        
        console.log('✅ 검색 결과:', JSON.stringify(searchResult, null, 2));
        console.log('');

        // 2. 상세정보 테스트 (검색 결과가 있으면)
        if (searchResult.success && searchResult.data.items.length > 0) {
            const contentId = searchResult.data.items[0].contentId;
            
            console.log(`📊 2. 상세정보 테스트 (${contentId})`);
            const detailResult = await tourism.processRequest('ultimateDetail', {
                contentId: contentId
            });
            
            console.log('✅ 상세정보 결과:', JSON.stringify(detailResult, null, 2));
            console.log('');
        }

        // 3. 위치 검색 테스트
        console.log('📍 3. 위치 검색 테스트 (서울 시청 주변)');
        const locationResult = await tourism.processRequest('locationSearch', {
            lat: 37.5665,
            lng: 126.9780,
            radius: 1000,
            numOfRows: 3
        });
        
        console.log('✅ 위치 검색 결과:', JSON.stringify(locationResult, null, 2));
        console.log('');

        // 4. 캐시 통계
        console.log('💾 4. 캐시 통계');
        console.log(tourism.cache.getStats());

        console.log('\n🎉 모든 테스트 완료!');

    } catch (error) {
        console.error('❌ 테스트 실패:', error);
    }
}

// ========================================
// 9. 메인 실행부
// ========================================

// Node.js 환경에서 직접 실행시
if (typeof module !== 'undefined' && require.main === module) {
    console.log('🚀 관광JS 시스템 시작...\n');
    testTourismSystem();
}

// 브라우저나 다른 환경에서 사용할 수 있도록 export
if (typeof module !== 'undefined') {
    module.exports = {
        TourismSystem,
        testTourismSystem,
        API_KEY
    };
}

// 글로벌 객체로도 제공 (브라우저용)
if (typeof window !== 'undefined') {
    window.TourismJS = {
        TourismSystem,
        testTourismSystem
    };
}
