// api/alltourism.js (거리 계산 문제 해결 버전)

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
            debug = 'false'
        } = req.query;
        
        const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY || process.env.JEONBUK_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                success: false, 
                message: 'API 키가 설정되지 않았습니다' 
            });
        }

        // 🔧 사용자 위치 검증 (더 엄격한 검증)
        const hasUserLocation = userLat && userLng && 
            userLat.trim() !== '' && userLng.trim() !== '' &&
            !isNaN(parseFloat(userLat)) && !isNaN(parseFloat(userLng));
        
        const radiusKm = radius && !isNaN(parseFloat(radius)) ? parseFloat(radius) : null;

        if (debug === 'true') {
            console.log('🔍 디버그 정보:', {
                userLat, userLng, radius, 
                hasUserLocation, radiusKm,
                userLatNum: hasUserLocation ? parseFloat(userLat) : null,
                userLngNum: hasUserLocation ? parseFloat(userLng) : null
            });
        }

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

        // 🔧 거리 계산 (강화된 로직)
        let distanceCalculated = 0;
        let distanceErrors = 0;
        
        if (hasUserLocation) {
            const userLatNum = parseFloat(userLat);
            const userLngNum = parseFloat(userLng);
            
            if (debug === 'true') {
                console.log(`🎯 사용자 위치: ${userLatNum}, ${userLngNum}`);
            }
            
            tourismData = tourismData.map((item, index) => {
                if (item.mapx && item.mapy && !isNaN(item.mapx) && !isNaN(item.mapy)) {
                    try {
                        const distance = calculateDistance(userLatNum, userLngNum, item.mapx, item.mapy);
                        
                        if (debug === 'true' && index < 3) {
                            console.log(`📍 ${item.title}: (${item.mapx}, ${item.mapy}) -> 거리: ${distance}km`);
                        }
                        
                        if (distance !== null && !isNaN(distance)) {
                            distanceCalculated++;
                            return { ...item, distance: Math.round(distance * 100) / 100 };
                        } else {
                            distanceErrors++;
                            return { ...item, distance: null };
                        }
                    } catch (error) {
                        distanceErrors++;
                        if (debug === 'true') {
                            console.error(`거리 계산 오류 (${item.title}):`, error.message);
                        }
                        return { ...item, distance: null };
                    }
                } else {
                    return { ...item, distance: null };
                }
            });
            
            if (debug === 'true') {
                console.log(`📊 거리 계산 통계: 성공 ${distanceCalculated}, 실패 ${distanceErrors}, 총 ${tourismData.length}`);
            }
            
            // 🔧 반경 필터링 (개선된 로직)
            if (radiusKm && radiusKm > 0) {
                const beforeFilter = tourismData.length;
                const itemsWithDistance = tourismData.filter(item => item.distance !== null);
                const itemsWithoutDistance = tourismData.filter(item => item.distance === null);
                
                // 거리 정보가 있는 항목만 반경 필터링
                const filteredWithDistance = itemsWithDistance.filter(item => item.distance <= radiusKm);
                
                // 🔧 거리 정보가 없는 항목은 조건부 포함 (반경이 크면 포함)
                const includeNoDistance = radiusKm >= 20; // 20km 이상이면 좌표 없는 항목도 포함
                
                if (includeNoDistance) {
                    tourismData = [...filteredWithDistance, ...itemsWithoutDistance.slice(0, 5)]; // 최대 5개만
                } else {
                    tourismData = filteredWithDistance;
                }
                
                if (debug === 'true') {
                    console.log(`🔍 반경 필터링 (${radiusKm}km):`);
                    console.log(`- 전체: ${beforeFilter}`);
                    console.log(`- 거리 정보 있음: ${itemsWithDistance.length}`);
                    console.log(`- 거리 정보 없음: ${itemsWithoutDistance.length}`);
                    console.log(`- 반경 내: ${filteredWithDistance.length}`);
                    console.log(`- 최종 결과: ${tourismData.length}`);
                    
                    // 샘플 거리 정보 출력
                    filteredWithDistance.slice(0, 5).forEach(item => {
                        console.log(`  - ${item.title}: ${item.distance}km`);
                    });
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
            version: '2.2.0',
            debug: debug === 'true' ? {
                originalItemCount: itemList.length,
                distanceCalculated,
                distanceErrors,
                afterDistanceFilter: enhancedData.length,
                hasCoordinates: enhancedData.filter(item => item.mapx && item.mapy).length,
                radiusFilter: radiusKm ? `${radiusKm}km` : null
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

// 🔧 더 안정적인 거리 계산 함수
function calculateDistance(lat1, lon1, lat2, lon2) {
    try {
        // 입력값 검증
        if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
            return null;
        }
        
        // 범위 검증
        if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) {
            return null;
        }
        
        if (lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) {
            return null;
        }
        
        const R = 6371; // 지구 반지름 (km)
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        // 결과 검증
        if (isNaN(distance) || distance < 0 || distance > 20000) { // 지구 둘레의 절반 이상은 비정상
            return null;
        }
        
        return distance;
        
    } catch (error) {
        console.error('거리 계산 오류:', error);
        return null;
    }
}

// 나머지 함수들은 이전과 동일...
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

function sortTourismData(data, sortBy, sortOrder) {
    return data.sort((a, b) => {
        let aVal, bVal;
        
        switch (sortBy) {
            case 'distance':
                // 거리 정보가 없는 항목은 마지막으로
                aVal = a.distance !== null && a.distance !== undefined ? a.distance : 999999;
                bVal = b.distance !== null && b.distance !== undefined ? b.distance : 999999;
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

// 나머지 헬퍼 함수들은 이전과 동일...
