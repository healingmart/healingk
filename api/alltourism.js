// api/alltourism.js (완벽한 최종 버전)

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { 
            keyword = '', 
            contentTypeId = '', 
            areaCode = '', 
            sigunguCode = '',
            numOfRows = '10',
            pageNo = '1',
            detailed = 'true',
            detailedCount = '5',
            sortBy = 'readcount',
            sortOrder = 'desc',
            includeImages = 'true',
            userLat = '',
            userLng = '',
            radius = '',
            debug = 'false'  // 🆕 디버그 모드
        } = req.query;
        
        const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY || process.env.JEONBUK_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                success: false, 
                message: 'API 키가 설정되지 않았습니다' 
            });
        }

        // 🔧 디버그 정보
        if (debug === 'true') {
            console.log('요청 파라미터:', { userLat, userLng, radius, areaCode, sortBy });
        }

        // 🔧 사용자 위치 검증
        const hasUserLocation = userLat && userLng && !isNaN(parseFloat(userLat)) && !isNaN(parseFloat(userLng));
        const radiusKm = radius ? parseFloat(radius) : null;

        let searchUrl = buildSearchUrl(apiKey, {
            keyword, contentTypeId, areaCode, sigunguCode, numOfRows, pageNo
        });

        console.log(`검색 URL: ${searchUrl}`);

        const startTime = Date.now();
        const response = await fetch(searchUrl);
        const data = await response.json();
        const searchTime = Date.now() - startTime;
        
        const resultCode = data.resultCode || data.response?.header?.resultCode;
        
        if (resultCode !== '0' && resultCode !== '0000') {
            return res.status(400).json({
                success: false,
                message: '데이터 조회 실패',
                error: data.response?.header?.resultMsg || '알 수 없는 오류',
                resultCode: resultCode,
                searchUrl: searchUrl.replace(apiKey, '***')
            });
        }

        const items = data.response?.body?.items?.item || [];
        const itemList = Array.isArray(items) ? items : items ? [items] : [];
        
        if (itemList.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    items: [],
                    totalCount: 0,
                    pageNo: parseInt(pageNo),
                    numOfRows: parseInt(numOfRows),
                    hasNext: false
                },
                message: '검색 결과가 없습니다',
                performance: { searchTime },
                debug: debug === 'true' ? { userLat, userLng, radius, hasUserLocation } : undefined
            });
        }

        // 기본 정보 매핑
        let tourismData = itemList.map(item => ({
            contentId: item.contentid,
            contentTypeId: item.contenttypeid,
            title: item.title,
            addr1: item.addr1,
            addr2: item.addr2 || null,
            tel: item.tel || null,
            firstimage: item.firstimage || null,
            firstimage2: item.firstimage2 || null,
            mapx: parseFloat(item.mapx) || null,
            mapy: parseFloat(item.mapy) || null,
            mlevel: item.mlevel || null,
            areacode: item.areacode || null,
            sigungucode: item.sigungucode || null,
            cat1: item.cat1 || null,
            cat2: item.cat2 || null,
            cat3: item.cat3 || null,
            readcount: parseInt(item.readcount) || 0,
            modifiedtime: item.modifiedtime || null,
            zipcode: item.zipcode || null,
            createdtime: item.createdtime || null,
            booktour: item.booktour || null
        }));

        // 🔧 거리 계산 (개선된 로직)
        if (hasUserLocation) {
            const userLatNum = parseFloat(userLat);
            const userLngNum = parseFloat(userLng);
            
            tourismData = tourismData.map(item => {
                if (item.mapx && item.mapy && !isNaN(item.mapx) && !isNaN(item.mapy)) {
                    const distance = calculateDistance(userLatNum, userLngNum, item.mapx, item.mapy);
                    return { ...item, distance: Math.round(distance * 100) / 100 };
                }
                return { ...item, distance: null };
            });
            
            // 🔧 반경 필터링 (개선된 로직)
            if (radiusKm && radiusKm > 0) {
                const beforeFilter = tourismData.length;
                tourismData = tourismData.filter(item => {
                    // 거리 정보가 없는 항목은 포함 (좌표가 없는 경우)
                    if (item.distance === null) return true;
                    return item.distance <= radiusKm;
                });
                
                if (debug === 'true') {
                    console.log(`거리 필터링: ${beforeFilter} -> ${tourismData.length} (반경: ${radiusKm}km)`);
                }
            }
        }

        // 정렬
        tourismData = sortTourismData(tourismData, sortBy, sortOrder);

        // 상세 정보 추가
        if (detailed === 'true' && tourismData.length > 0) {
            const maxDetailed = Math.min(parseInt(detailedCount), tourismData.length, 10);
            const detailedItems = tourismData.slice(0, maxDetailed);
            
            const detailStartTime = Date.now();
            const detailedPromises = detailedItems.map(async (item, index) => {
                try {
                    const detailInfo = await getEnhancedDetailedInfo(apiKey, item.contentId, item.contentTypeId, {
                        includeImages: includeImages === 'true'
                    });
                    return { ...item, detailed: detailInfo };
                } catch (error) {
                    console.error(`상세 정보 수집 실패 (${item.contentId}):`, error.message);
                    return {
                        ...item,
                        detailed: { 
                            error: error.message, 
                            completeness: 20,
                            hasError: true,
                            type: getContentTypeName(item.contentTypeId)
                        }
                    };
                }
            });
            
            const detailedResults = await Promise.all(detailedPromises);
            const detailTime = Date.now() - detailStartTime;
            
            tourismData = [...detailedResults, ...tourismData.slice(maxDetailed)];
        }

        // 카테고리 정보 매핑
        const enhancedData = tourismData.map(item => ({
            ...item,
            typeName: getContentTypeName(item.contentTypeId),
            categoryInfo: getCategoryInfo(item.cat1, item.cat2, item.cat3),
            areaInfo: getAreaInfo(item.areacode, item.sigungucode)
        }));

        // 응답 데이터 구성
        const responseData = {
            items: enhancedData,
            totalCount: data.response?.body?.totalCount || enhancedData.length,
            pageNo: parseInt(pageNo),
            numOfRows: parseInt(numOfRows),
            hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < (data.response?.body?.totalCount || enhancedData.length),
            resultInfo: {
                actualCount: enhancedData.length,
                detailedCount: enhancedData.filter(item => item.detailed).length,
                withImages: enhancedData.filter(item => item.firstimage).length,
                withCoordinates: enhancedData.filter(item => item.mapx && item.mapy).length,
                withDistance: enhancedData.filter(item => item.distance !== undefined && item.distance !== null).length
            }
        };

        // 상세 정보 통계
        if (detailed === 'true') {
            const detailedItems = enhancedData.filter(item => item.detailed);
            const successfulDetails = detailedItems.filter(item => !item.detailed?.hasError);
            
            responseData.detailStats = {
                totalItems: enhancedData.length,
                detailedItems: detailedItems.length,
                successfulDetails: successfulDetails.length,
                failedDetails: detailedItems.length - successfulDetails.length,
                avgCompleteness: successfulDetails.length > 0 
                    ? Math.round(successfulDetails.reduce((sum, item) => sum + item.detailed.completeness, 0) / successfulDetails.length)
                    : 0,
                completenessDistribution: getCompletenessDistribution(successfulDetails),
                typeStats: getTypeStats(successfulDetails)
            };
        }

        const totalTime = Date.now() - startTime;
        const performance = {
            totalTime,
            searchTime,
            detailTime: detailed === 'true' ? totalTime - searchTime : 0,
            itemsPerSecond: enhancedData.length > 0 ? Math.round((enhancedData.length / totalTime) * 1000) : 0,
            cacheHit: false
        };

        return res.status(200).json({
            success: true,
            data: responseData,
            searchParams: {
                keyword: keyword || null,
                contentTypeId: contentTypeId || null,
                areaCode: areaCode || null,
                sigunguCode: sigunguCode || null,
                detailed: detailed === 'true',
                detailedCount: parseInt(detailedCount),
                sortBy,
                sortOrder,
                includeImages: includeImages === 'true',
                hasUserLocation,
                userLocation: hasUserLocation ? { lat: parseFloat(userLat), lng: parseFloat(userLng) } : null,
                radius: radiusKm
            },
            performance,
            timestamp: new Date().toISOString(),
            version: '2.1.0',
            debug: debug === 'true' ? {
                originalItemCount: itemList.length,
                afterDistanceFilter: enhancedData.length,
                hasCoordinates: enhancedData.filter(item => item.mapx && item.mapy).length
            } : undefined
        });

    } catch (error) {
        console.error('관광 정보 API 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            timestamp: new Date().toISOString()
        });
    }
};

// 🔧 개선된 거리 계산 함수
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 지구 반지름 (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    // 유효성 검증
    if (isNaN(distance) || distance < 0) {
        return null;
    }
    
    return distance;
}

// 🔧 개선된 정렬 함수
function sortTourismData(data, sortBy, sortOrder) {
    return data.sort((a, b) => {
        let aVal, bVal;
        
        switch (sortBy) {
            case 'distance':
                // 거리 정보가 없는 항목은 마지막으로
                aVal = a.distance !== null ? a.distance : 999999;
                bVal = b.distance !== null ? b.distance : 999999;
                break;
            case 'modifiedtime':
                aVal = a.modifiedtime || '0';
                bVal = b.modifiedtime || '0';
                break;
            case 'readcount':
            default:
                aVal = a.readcount || 0;
                bVal = b.readcount || 0;
                break;
        }
        
        if (sortOrder === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
}

// 기존 함수들은 동일하게 유지...
function buildSearchUrl(apiKey, params) {
    const { keyword, contentTypeId, areaCode, sigunguCode, numOfRows, pageNo } = params;
    
    let baseUrl;
    let searchUrl;
    
    if (keyword) {
        baseUrl = 'https://apis.data.go.kr/B551011/KorService2/searchKeyword2';
        searchUrl = `${baseUrl}?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&keyword=${encodeURIComponent(keyword)}&numOfRows=${numOfRows}&pageNo=${pageNo}`;
    } else {
        baseUrl = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
        searchUrl = `${baseUrl}?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}`;
    }
    
    if (contentTypeId) searchUrl += `&contentTypeId=${contentTypeId}`;
    if (areaCode) searchUrl += `&areaCode=${areaCode}`;
    if (sigunguCode) searchUrl += `&sigunguCode=${sigunguCode}`;
    
    return searchUrl;
}

async function getEnhancedDetailedInfo(apiKey, contentId, contentTypeId, options = {}) {
    try {
        const urls = [
            `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`,
            `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`
        ];
        
        if (options.includeImages) {
            urls.push(`https://apis.data.go.kr/B551011/KorService2/detailImage2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&imageYN=Y`);
        }
        
        const responses = await Promise.all(urls.map(url => fetch(url)));
        const dataArray = await Promise.all(responses.map(res => res.json()));
        
        const [commonData, introData, imageData] = dataArray;
        
        let detailed = { 
            completeness: 20,
            hasError: false,
            type: getContentTypeName(contentTypeId),
            collectedAt: new Date().toISOString()
        };
        
        const commonCode = commonData.resultCode || commonData.response?.header?.resultCode;
        if (commonCode === '0' || commonCode === '0000') {
            const commonItem = commonData.response?.body?.items?.item || commonData.items?.item || commonData.item;
            if (commonItem) {
                const itemData = Array.isArray(commonItem) ? commonItem[0] : commonItem;
                detailed.common = {
                    overview: itemData.overview || null,
                    tel: itemData.tel || null,
                    homepage: itemData.homepage?.replace(/<[^>]*>/g, '') || null,
                    usetime: itemData.usetime || null,
                    parking: itemData.parking || null,
                    usefee: itemData.usefee || null,
                    restdate: itemData.restdate || null,
                    infocenter: itemData.infocenter || null,
                    zipcode: itemData.zipcode || null,
                    sponsor1: itemData.sponsor1 || null,
                    sponsor1tel: itemData.sponsor1tel || null,
                    sponsor2: itemData.sponsor2 || null,
                    sponsor2tel: itemData.sponsor2tel || null
                };
                
                if (detailed.common.overview) detailed.completeness += 25;
                if (detailed.common.tel) detailed.completeness += 15;
                if (detailed.common.homepage) detailed.completeness += 10;
                if (detailed.common.usetime) detailed.completeness += 10;
                if (detailed.common.parking) detailed.completeness += 5;
                if (detailed.common.usefee) detailed.completeness += 5;
                if (detailed.common.infocenter) detailed.completeness += 5;
            }
        }
        
        const introCode = introData.resultCode || introData.response?.header?.resultCode;
        if (introCode === '0' || introCode === '0000') {
            const introItem = introData.response?.body?.items?.item || introData.items?.item || introData.item;
            if (introItem) {
                const itemData = Array.isArray(introItem) ? introItem[0] : introItem;
                detailed.intro = buildIntroData(contentTypeId, itemData);
                detailed.completeness += calculateIntroCompleteness(contentTypeId, detailed.intro);
            }
        }
        
        if (options.includeImages && imageData) {
            const imageCode = imageData.resultCode || imageData.response?.header?.resultCode;
            if (imageCode === '0' || imageCode === '0000') {
                const imageItems = imageData.response?.body?.items?.item || [];
                const imageList = Array.isArray(imageItems) ? imageItems : [imageItems];
                detailed.images = imageList.map(img => ({
                    originimgurl: img.originimgurl,
                    smallimageurl: img.smallimageurl,
                    cpyrhtDivCd: img.cpyrhtDivCd,
                    imgname: img.imgname,
                    serialnum: img.serialnum
                })).filter(img => img.originimgurl);
                
                if (detailed.images.length > 0) detailed.completeness += 5;
            }
        }
        
        detailed.completeness = Math.min(detailed.completeness, 100);
        return detailed;
        
    } catch (error) {
        return { 
            completeness: 20, 
            hasError: true, 
            error: error.message,
            type: getContentTypeName(contentTypeId)
        };
    }
}

function buildIntroData(contentTypeId, itemData) {
    const baseIntro = { type: getContentTypeName(contentTypeId) };
    
    if (contentTypeId === '32') { // 숙박
        return {
            ...baseIntro,
            roomCount: itemData.roomcount || null,
            checkIn: itemData.checkintime || null,
            checkOut: itemData.checkouttime || null,
            roomType: itemData.roomtype || null,
            accomount: itemData.accomount || null,
            subfacility: itemData.subfacility || null,
            barbecue: itemData.barbecue || null,
            beauty: itemData.beauty || null,
            bicycle: itemData.bicycle || null,
            campfire: itemData.campfire || null,
            fitness: itemData.fitness || null,
            karaoke: itemData.karaoke || null,
            publicbath: itemData.publicbath || null,
            sauna: itemData.sauna || null,
            seminar: itemData.seminar || null,
            sports: itemData.sports || null
        };
    } else if (contentTypeId === '39') { // 음식점
        return {
            ...baseIntro,
            treatMenu: itemData.treatmenu || null,
            openTime: itemData.opentimefood || null,
            restDate: itemData.restdatefood || null,
            firstMenu: itemData.firstmenu || null,
            smoking: itemData.smoking || null,
            packing: itemData.packing || null,
            seat: itemData.seat || null,
            lcnsno: itemData.lcnsno || null,
            kidsfacility: itemData.kidsfacility || null
        };
    } else if (contentTypeId === '12') { // 관광지
        return {
            ...baseIntro,
            expguide: itemData.expguide || null,
            heritage1: itemData.heritage1 || null,
            heritage2: itemData.heritage2 || null,
            heritage3: itemData.heritage3 || null,
            useseason: itemData.useseason || null,
            accomcount: itemData.accomcount || null,
            chkbabycarriage: itemData.chkbabycarriage || null,
            chkpet: itemData.chkpet || null,
            chkcreditcard: itemData.chkcreditcard || null,
            expagerange: itemData.expagerange || null
        };
    }
    
    return baseIntro;
}

function calculateIntroCompleteness(contentTypeId, intro) {
    let score = 0;
    
    if (contentTypeId === '32') { // 숙박
        if (intro.roomCount) score += 10;
        if (intro.checkIn) score += 5;
        if (intro.roomType) score += 5;
        if (intro.subfacility) score += 5;
    } else if (contentTypeId === '39') { // 음식점
        if (intro.treatMenu) score += 15;
        if (intro.openTime) score += 5;
        if (intro.firstMenu) score += 5;
    } else if (contentTypeId === '12') { // 관광지
        if (intro.expguide) score += 10;
        if (intro.heritage1 && intro.heritage1 !== '0') score += 10;
        if (intro.useseason) score += 5;
    }
    
    return Math.min(score, 25);
}

function getCategoryInfo(cat1, cat2, cat3) {
    const categoryMap = {
        'A01': '자연', 'A02': '인문(문화/예술/역사)', 'A03': '레포츠',
        'A04': '쇼핑', 'A05': '음식', 'B02': '숙박'
    };
    
    return {
        main: categoryMap[cat1] || '기타',
        cat1, cat2, cat3
    };
}

function getAreaInfo(areaCode, sigunguCode) {
    const areaMap = {
        '1': '서울', '2': '인천', '3': '대전', '4': '대구', '5': '광주',
        '6': '부산', '7': '울산', '8': '세종', '31': '경기', '32': '강원',
        '33': '충북', '34': '충남', '35': '경북', '36': '경남', '37': '전북',
        '38': '전남', '39': '제주'
    };
    
    return {
        area: areaMap[areaCode] || '기타',
        areaCode,
        sigunguCode
    };
}

function getContentTypeName(contentTypeId) {
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

function getCompletenessDistribution(items) {
    const distribution = { excellent: 0, good: 0, fair: 0, poor: 0 };
    items.forEach(item => {
        const score = item.detailed.completeness;
        if (score >= 90) distribution.excellent++;
        else if (score >= 70) distribution.good++;
        else if (score >= 50) distribution.fair++;
        else distribution.poor++;
    });
    return distribution;
}

function getTypeStats(items) {
    const typeStats = {};
    items.forEach(item => {
        const type = item.detailed.type;
        if (!typeStats[type]) {
            typeStats[type] = { count: 0, avgCompleteness: 0 };
        }
        typeStats[type].count++;
        typeStats[type].avgCompleteness += item.detailed.completeness;
    });
    
    Object.keys(typeStats).forEach(type => {
        typeStats[type].avgCompleteness = Math.round(typeStats[type].avgCompleteness / typeStats[type].count);
    });
    
    return typeStats;
}
