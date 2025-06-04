// core/engines/detail-engine.js - 완벽한 상세정보 처리 엔진

const { TourAPIClient } = require('../../utils/api-client');
const CacheManager = require('../performance/cache-manager');

class DetailEngine {
    constructor() {
        this.apiClient = new TourAPIClient();
        this.cacheManager = new CacheManager();
        this.apiKey = process.env.TOURISM_API_KEY;
        
        console.log('📊 상세정보 엔진 초기화 완료');
    }

    // 모든 상세정보 수집 (병렬 처리)
    async collectAllDetails(contentId, context = {}) {
        console.log(`📊 상세정보 수집 시작: ${contentId}`);
        
        const startTime = Date.now();
        
        // 캐시 확인
        const cacheKey = this.cacheManager.generateKey('detail-all', { contentId });
        const cached = await this.cacheManager.get(cacheKey);
        
        if (cached && !context.bypassCache) {
            console.log(`⚡ 상세정보 캐시 히트: ${contentId}`);
            return { ...cached, fromCache: true };
        }

        try {
            // 1단계: 기본 정보로 contentTypeId 확인
            const commonData = await this.fetchDetailCommon(contentId);
            const contentTypeId = commonData.contentTypeId;
            
            console.log(`📋 콘텐츠 타입: ${contentTypeId} (${this.getContentTypeName(contentTypeId)})`);

            // 2단계: 병렬로 모든 상세정보 수집
            const [introResult, infoResult, imageResult, petResult] = await Promise.allSettled([
                this.fetchDetailIntro(contentId, contentTypeId),
                this.fetchDetailInfo(contentId, contentTypeId),
                this.fetchDetailImages(contentId),
                this.fetchDetailPetTour(contentId).catch(() => null)
            ]);

            // 3단계: 결과 처리 및 구조화
            const detailData = {
                // 기본 정보 (필수)
                common: this.processCommonData(commonData),
                
                // 소개 정보
                intro: introResult.status === 'fulfilled' ? 
                    this.processIntroData(contentTypeId, introResult.value) : null,
                
                // 반복 정보  
                info: infoResult.status === 'fulfilled' ? 
                    this.processInfoData(contentTypeId, infoResult.value) : [],
                
                // 이미지 정보
                images: imageResult.status === 'fulfilled' ? 
                    this.processImageData(imageResult.value) : [],
                
                // 반려동물 정보 (선택적)
                petTour: petResult.status === 'fulfilled' && petResult.value ? 
                    this.processPetTourData(petResult.value) : null,

                // 메타 정보
                meta: {
                    contentId,
                    contentTypeId,
                    typeName: this.getContentTypeName(contentTypeId),
                    collectedAt: new Date().toISOString(),
                    collectionTime: Date.now() - startTime
                }
            };

            // 4단계: 캐싱 (2시간)
            await this.cacheManager.set(cacheKey, detailData, 7200);
            
            console.log(`✅ 상세정보 수집 완료: ${Date.now() - startTime}ms`);
            return detailData;

        } catch (error) {
            console.error(`❌ 상세정보 수집 실패: ${contentId}`, error);
            throw error;
        }
    }

    // 고급 분석 (AI 없는 버전)
    async performAdvancedAnalysis(detailData, context = {}) {
        console.log('🔍 고급 분석 시작 (AI 없는 버전)');
        
        const analysis = {
            // 데이터 완성도 분석
            completeness: this.analyzeCompleteness(detailData),
            
            // 콘텐츠 품질 분석
            quality: this.analyzeQuality(detailData),
            
            // 접근성 분석
            accessibility: this.analyzeAccessibility(detailData),
            
            // 사용자 경험 분석
            userExperience: this.analyzeUserExperience(detailData),
            
            // 키워드 추출 (간단한 알고리즘)
            keywords: this.extractKeywords(detailData),
            
            // 추천 정보 생성
            recommendations: this.generateRecommendations(detailData),
            
            // 블로그 콘텐츠 준비
            blogReady: this.prepareBlogContent(detailData)
        };

        return {
            ...detailData,
            analysis
        };
    }

    // TourAPI 개별 호출 함수들
    async fetchDetailCommon(contentId) {
        const url = this.apiClient.buildUrl('/detailCommon2', {
            serviceKey: this.apiKey,
            contentId
        });

        const response = await this.apiClient.fetchWithRetry(url);
        const data = await response.json();
        
        this.apiClient.validateApiResponse(data, 'detailCommon');
        return this.apiClient.extractSingleItem(data);
    }

    async fetchDetailIntro(contentId, contentTypeId) {
        const url = this.apiClient.buildUrl('/detailIntro2', {
            serviceKey: this.apiKey,
            contentId,
            contentTypeId
        });

        const response = await this.apiClient.fetchWithRetry(url);
        const data = await response.json();
        
        this.apiClient.validateApiResponse(data, 'detailIntro');
        return this.apiClient.extractSingleItem(data);
    }

    async fetchDetailInfo(contentId, contentTypeId) {
        const url = this.apiClient.buildUrl('/detailInfo2', {
            serviceKey: this.apiKey,
            contentId,
            contentTypeId
        });

        const response = await this.apiClient.fetchWithRetry(url);
        const data = await response.json();
        
        this.apiClient.validateApiResponse(data, 'detailInfo');
        return this.apiClient.extractItems(data);
    }

    async fetchDetailImages(contentId) {
        const url = this.apiClient.buildUrl('/detailImage2', {
            serviceKey: this.apiKey,
            contentId,
            imageYN: 'Y'
        });

        const response = await this.apiClient.fetchWithRetry(url);
        const data = await response.json();
        
        this.apiClient.validateApiResponse(data, 'detailImage');
        return this.apiClient.extractItems(data);
    }

    async fetchDetailPetTour(contentId) {
        const url = this.apiClient.buildUrl('/detailPetTour2', {
            serviceKey: this.apiKey,
            contentId
        });

        const response = await this.apiClient.fetchWithRetry(url);
        const data = await response.json();
        
        this.apiClient.validateApiResponse(data, 'detailPetTour');
        return this.apiClient.extractItems(data);
    }

    // 데이터 처리 함수들
    processCommonData(commonData) {
        return {
            // 기본 정보
            contentId: commonData.contentid,
            contentTypeId: commonData.contenttypeid,
            title: commonData.title,
            
            // 설명
            overview: this.cleanHtmlContent(commonData.overview),
            
            // 위치 정보
            location: {
                address: {
                    main: commonData.addr1,
                    detail: commonData.addr2,
                    zipcode: commonData.zipcode,
                    full: `${commonData.addr1}${commonData.addr2 ? ' ' + commonData.addr2 : ''}`
                },
                coordinates: commonData.mapx && commonData.mapy ? {
                    lng: parseFloat(commonData.mapx),
                    lat: parseFloat(commonData.mapy),
                    accuracy: commonData.mlevel
                } : null,
                area: {
                    code: commonData.areacode,
                    name: this.getAreaName(commonData.areacode),
                    sigungu: {
                        code: commonData.sigungucode,
                        name: this.getSigunguName(commonData.areacode, commonData.sigungucode)
                    }
                }
            },
            
            // 연락처
            contact: {
                tel: commonData.tel,
                telname: commonData.telname,
                homepage: this.cleanHtmlContent(commonData.homepage)
            },
            
            // 미디어
            media: {
                primaryImage: commonData.firstimage,
                thumbnailImage: commonData.firstimage2,
                copyrightCode: commonData.cpyrhtDivCd
            },
            
            // 카테고리
            category: {
                main: commonData.cat1,
                middle: commonData.cat2,
                sub: commonData.cat3,
                hierarchy: this.getCategoryHierarchy(commonData.cat1, commonData.cat2, commonData.cat3)
            },
            
            // 메타 데이터
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
            contentTypeId: introData.contenttypeid
        };

        // 콘텐츠 타입별 특화 처리
        switch (contentTypeId) {
            case '12': // 관광지
                return this.processTouristSpotIntro(base, introData);
            case '14': // 문화시설
                return this.processCulturalFacilityIntro(base, introData);
            case '15': // 축제/행사
                return this.processFestivalIntro(base, introData);
            case '25': // 여행코스
                return this.processTravelCourseIntro(base, introData);
            case '28': // 레포츠
                return this.processLeisureSportsIntro(base, introData);
            case '32': // 숙박
                return this.processAccommodationIntro(base, introData);
            case '38': // 쇼핑
                return this.processShoppingIntro(base, introData);
            case '39': // 음식점
                return this.processRestaurantIntro(base, introData);
            default:
                return base;
        }
    }

    // 관광지 소개정보 처리
    processTouristSpotIntro(base, data) {
        return {
            ...base,
            type: 'tourist-spot',
            facilities: {
                capacity: data.accomcount,
                babyCarriage: data.chkbabycarriage === '1',
                creditCard: data.chkcreditcard === '1',
                pet: data.chkpet === '1',
                parking: data.parking
            },
            experience: {
                ageRange: data.expagerange,
                guide: data.expguide
            },
            heritage: {
                designation1: data.heritage1,
                designation2: data.heritage2,
                designation3: data.heritage3
            },
            operation: {
                season: data.useseason,
                hours: data.usetime,
                restDays: data.restdate,
                openDate: data.opendate
            },
            contact: {
                infoCenter: data.infocenter
            }
        };
    }

    // 음식점 소개정보 처리  
    processRestaurantIntro(base, data) {
        return {
            ...base,
            type: 'restaurant',
            menu: {
                signature: data.firstmenu,
                recommended: data.treatmenu
            },
            facilities: {
                parking: data.parkingfood,
                kids: data.kidsfacility,
                smoking: data.smoking,
                packing: data.packing === '1'
            },
            service: {
                creditCard: data.chkcreditcardfood === '1',
                reservation: data.reservationfood === '1',
                discount: data.discountinfofood
            },
            info: {
                seats: data.seat,
                scale: data.scalefood,
                license: data.lcnsno,
                openDate: data.opendatefood
            },
            hours: {
                operating: data.opentimefood,
                closed: data.restdatefood
            }
        };
    }

    // 숙박 소개정보 처리
    processAccommodationIntro(base, data) {
        return {
            ...base,
            type: 'accommodation',
            basic: {
                roomCount: data.roomcount,
                capacity: data.accomcountlodging,
                scale: data.scalelodging
            },
            checkin: {
                time: data.checkintime,
                checkoutTime: data.checkouttime
            },
            facilities: {
                cooking: data.chkcooking === '1',
                parking: data.parkinglodging,
                pickup: data.pickup === '1'
            },
            services: {
                reservation: {
                    available: data.reservationlodging === '1',
                    url: data.reservationurl
                },
                dining: data.foodplace
            },
            amenities: {
                barbecue: data.barbecue === '1',
                beauty: data.beauty === '1',
                beverage: data.beverage === '1',
                bicycle: data.bicycle === '1',
                campfire: data.campfire === '1',
                fitness: data.fitness === '1',
                karaoke: data.karaoke === '1',
                publicBath: data.publicbath === '1',
                publicPC: data.publicpc === '1',
                sauna: data.sauna === '1',
                seminar: data.seminar === '1',
                sports: data.sports === '1'
            },
            policies: {
                refund: data.refundregulation
            }
        };
    }

    // 이미지 데이터 처리
    processImageData(imageData) {
        if (!imageData || !Array.isArray(imageData)) return [];

        return imageData.map((image, index) => ({
            id: index + 1,
            contentId: image.contentid,
            originalUrl: image.originimgurl,
            smallUrl: image.smallimageurl,
            name: image.imgname,
            serialNumber: image.serialnum,
            copyrightCode: image.cpyrhtDivCd,
            isPrimary: index === 0,
            
            // 이미지 분석 (간단한 버전)
            analysis: {
                hasImage: !!image.originimgurl,
                format: this.getImageFormat(image.originimgurl),
                isHighQuality: this.assessImageQuality(image.originimgurl)
            }
        }));
    }

    // 데이터 완성도 분석 (AI 없는 버전)
    analyzeCompleteness(detailData) {
        let score = 0;
        let maxScore = 100;
        const breakdown = {};

        // 기본 정보 (40점)
        const basicScore = this.scoreBasicCompleteness(detailData.common);
        score += basicScore;
        breakdown.basic = { score: basicScore, maxScore: 40 };

        // 소개 정보 (25점)
        const introScore = detailData.intro ? 25 : 0;
        score += introScore;
        breakdown.intro = { score: introScore, maxScore: 25 };

        // 이미지 정보 (20점)
        const imageScore = this.scoreImageCompleteness(detailData.images);
        score += imageScore;
        breakdown.images = { score: imageScore, maxScore: 20 };

        // 반복 정보 (15점)
        const infoScore = this.scoreInfoCompleteness(detailData.info);
        score += infoScore;
        breakdown.info = { score: infoScore, maxScore: 15 };

        const percentage = Math.round((score / maxScore) * 100);

        return {
            overall: {
                score,
                maxScore,
                percentage,
                grade: this.getGrade(percentage)
            },
            breakdown,
            recommendations: this.generateCompletenessRecommendations(breakdown)
        };
    }

    // 품질 분석 (AI 없는 버전)
    analyzeQuality(detailData) {
        return {
            content: {
                hasOverview: !!detailData.common.overview,
                overviewLength: detailData.common.overview?.length || 0,
                hasContact: !!detailData.common.contact.tel,
                hasLocation: !!detailData.common.location.coordinates
            },
            images: {
                count: detailData.images.length,
                hasHighQuality: detailData.images.some(img => img.analysis.isHighQuality),
                formats: [...new Set(detailData.images.map(img => img.analysis.format))]
            },
            accessibility: {
                hasAddress: !!detailData.common.location.address.main,
                hasCoordinates: !!detailData.common.location.coordinates,
                hasContactInfo: !!detailData.common.contact.tel
            }
        };
    }

    // 키워드 추출 (간단한 알고리즘)
    extractKeywords(detailData) {
        const text = [
            detailData.common.title,
            detailData.common.overview,
            detailData.common.location.address.main
        ].filter(Boolean).join(' ');

        // 간단한 키워드 추출 (한국어 기준)
        const keywords = [];
        
        // 지역명 추출
        if (detailData.common.location.area.name) {
            keywords.push(detailData.common.location.area.name);
        }
        
        // 카테고리 추출
        if (detailData.common.category.hierarchy) {
            keywords.push(...detailData.common.category.hierarchy);
        }
        
        // 타입명 추가
        keywords.push(detailData.common.metadata.typeName);
        
        return [...new Set(keywords)]; // 중복 제거
    }

    // 블로그 콘텐츠 준비 (AI 없는 버전)
    prepareBlogContent(detailData) {
        const common = detailData.common;
        
        return {
            title: {
                main: common.title,
                seo: `${common.title} - ${common.location.area.name} ${common.metadata.typeName} 완전 가이드`,
                social: `${common.title} 방문 후기와 모든 정보 총정리 ✨`
            },
            summary: this.generateSummary(detailData),
            highlights: this.generateHighlights(detailData),
            practicalInfo: this.generatePracticalInfo(detailData),
            visitTips: this.generateVisitTips(detailData),
            seoKeywords: this.extractKeywords(detailData)
        };
    }

    // 유틸리티 함수들
    cleanHtmlContent(html) {
        if (!html) return null;
        return html
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
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

    getAreaName(areaCode) {
        const areaMap = {
            '1': '서울', '2': '인천', '3': '대전', '4': '대구', '5': '광주',
            '6': '부산', '7': '울산', '8': '세종', '31': '경기', '32': '강원',
            '33': '충북', '34': '충남', '35': '경북', '36': '경남', '37': '전북',
            '38': '전남', '39': '제주'
        };
        return areaMap[areaCode] || '기타';
    }

    getGrade(percentage) {
        if (percentage >= 90) return 'A+';
        if (percentage >= 80) return 'A';
        if (percentage >= 70) return 'B+';
        if (percentage >= 60) return 'B';
        if (percentage >= 50) return 'C+';
        return 'C';
    }

    generateSummary(detailData) {
        const { title, location, metadata } = detailData.common;
        return `${location.area.name}에 위치한 ${metadata.typeName} ${title}에 대한 상세 정보를 확인하세요.`;
    }

    generateHighlights(detailData) {
        const highlights = [];
        
        if (detailData.common.overview) {
            highlights.push('상세한 소개 정보 제공');
        }
        
        if (detailData.images.length > 0) {
            highlights.push(`${detailData.images.length}장의 이미지 갤러리`);
        }
        
        if (detailData.common.contact.tel) {
            highlights.push('연락처 정보 확인 가능');
        }
        
        return highlights;
    }

    generatePracticalInfo(detailData) {
        const info = {};
        
        if (detailData.common.location.address.full) {
            info.address = detailData.common.location.address.full;
        }
        
        if (detailData.common.contact.tel) {
            info.contact = detailData.common.contact.tel;
        }
        
        if (detailData.intro?.operation?.hours) {
            info.hours = detailData.intro.operation.hours;
        }
        
        return info;
    }

    generateVisitTips(detailData) {
        const tips = [];
        
        if (detailData.intro?.facilities?.parking) {
            tips.push('주차 시설 이용 가능');
        }
        
        if (detailData.intro?.facilities?.creditCard) {
            tips.push('신용카드 결제 가능');
        }
        
        if (detailData.intro?.operation?.restDays) {
            tips.push(`휴무일: ${detailData.intro.operation.restDays}`);
        }
        
        return tips;
    }

    // 나머지 유틸리티 함수들...
    scoreBasicCompleteness(common) {
        let score = 0;
        if (common.title) score += 10;
        if (common.overview) score += 15;
        if (common.location.coordinates) score += 10;
        if (common.contact.tel) score += 5;
        return Math.min(40, score);
    }

    scoreImageCompleteness(images) {
        if (images.length === 0) return 0;
        if (images.length >= 3) return 20;
        if (images.length >= 1) return 15;
        return 10;
    }

    scoreInfoCompleteness(info) {
        if (!Array.isArray(info)) return 0;
        return Math.min(15, info.length * 3);
    }

    getImageFormat(url) {
        if (!url) return 'unknown';
        const ext = url.split('.').pop()?.toLowerCase();
        return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'unknown';
    }

    assessImageQuality(url) {
        // 간단한 품질 평가 (URL 기반)
        return url && url.includes('image2'); // TourAPI의 고품질 이미지 패턴
    }

    getCategoryHierarchy(cat1, cat2, cat3) {
        const categories = [cat1, cat2, cat3].filter(Boolean);
        return categories;
    }

    getSigunguName(areaCode, sigunguCode) {
        // 시군구 매핑은 너무 많아서 기본값만
        return sigunguCode || '전체';
    }

    generateCompletenessRecommendations(breakdown) {
        const recommendations = [];
        
        if (breakdown.basic.score < 30) {
            recommendations.push('기본 정보(제목, 설명, 연락처)를 보완해주세요');
        }
        
        if (breakdown.images.score < 15) {
            recommendations.push('이미지를 추가하면 완성도가 크게 향상됩니다');
        }
        
        if (breakdown.intro.score === 0) {
            recommendations.push('소개 정보를 추가하면 방문자에게 더 유용합니다');
        }
        
        return recommendations;
    }
}

module.exports = DetailEngine;
