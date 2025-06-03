// api/test.js (실제 데이터 존재 여부 확인 버전)

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { test = '1' } = req.query;
        
        const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY || process.env.JEONBUK_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, message: '❌ API 키 없음' });
        }

        let result = {};

        if (test === '11') {
            // 🔍 실제 존재하는 음식점 contentId 검색
            const searchUrl = `https://apis.data.go.kr/B551011/KorService2/searchKeyword2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&keyword=맛집&contentTypeId=39&numOfRows=5`;
            
            const response = await fetch(searchUrl);
            const data = await response.json();
            
            result = {
                success: true,
                type: '음식점 검색',
                searchData: data,
                availableRestaurants: extractContentIds(data, '음식점')
            };
            
        } else if (test === '12') {
            // 🔍 실제 존재하는 관광지 contentId 검색  
            const searchUrl = `https://apis.data.go.kr/B551011/KorService2/searchKeyword2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&keyword=관광&contentTypeId=12&numOfRows=5`;
            
            const response = await fetch(searchUrl);
            const data = await response.json();
            
            result = {
                success: true,
                type: '관광지 검색',
                searchData: data,
                availableTourists: extractContentIds(data, '관광지')
            };
            
        } else if (test === '13') {
            // 🔍 검색으로 찾은 실제 음식점 데이터 분석
            // 우선 서울 지역 음식점 검색
            const searchUrl = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentTypeId=39&areaCode=1&numOfRows=3`;
            
            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();
            
            let restaurantList = [];
            const searchCode = searchData.resultCode || searchData.response?.header?.resultCode;
            
            if (searchCode === '0' || searchCode === '0000') {
                const items = searchData.response?.body?.items?.item || [];
                const itemList = Array.isArray(items) ? items : [items];
                
                // 첫 번째 음식점으로 상세 정보 테스트
                if (itemList.length > 0) {
                    const firstRestaurant = itemList[0];
                    const detailResult = await analyzeData(apiKey, firstRestaurant.contentid, '39', '음식점');
                    
                    restaurantList = itemList.map(item => ({
                        contentId: item.contentid,
                        title: item.title,
                        addr1: item.addr1,
                        tel: item.tel || 'N/A'
                    }));
                    
                    result = {
                        success: true,
                        type: '실제 음식점 분석',
                        restaurantList: restaurantList,
                        detailAnalysis: detailResult,
                        searchResponse: searchData.response?.header
                    };
                } else {
                    result = {
                        success: false,
                        message: '검색된 음식점이 없습니다',
                        searchData: searchData
                    };
                }
            }
            
        } else if (test === '14') {
            // 🐛 API 응답 구조 디버깅
            const contentId = '264302';
            const contentTypeId = '39';
            
            const commonUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
            const introUrl = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;
            
            const [commonRes, introRes] = await Promise.all([fetch(commonUrl), fetch(introUrl)]);
            const [commonData, introData] = await Promise.all([commonRes.json(), introRes.json()]);
            
            result = {
                success: true,
                type: 'API 응답 디버깅',
                contentId: contentId,
                commonResponse: {
                    resultCode: commonData.resultCode || commonData.response?.header?.resultCode,
                    resultMsg: commonData.resultMsg || commonData.response?.header?.resultMsg,
                    fullData: commonData
                },
                introResponse: {
                    resultCode: introData.resultCode || introData.response?.header?.resultCode,
                    resultMsg: introData.resultMsg || introData.response?.header?.resultMsg,
                    fullData: introData
                }
            };
            
        } else if (test === '3') {
            // 🏨 기존 성공한 숙박 (재확인)
            result = await analyzeData(apiKey, '142785', '32', '숙박');
        }

        return res.status(200).json({
            success: true,
            test: test,
            result: result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

// contentId 추출 함수
function extractContentIds(data, type) {
    const code = data.resultCode || data.response?.header?.resultCode;
    if (code === '0' || code === '0000') {
        const items = data.response?.body?.items?.item || [];
        const itemList = Array.isArray(items) ? items : [items];
        
        return itemList.slice(0, 3).map(item => ({
            contentId: item.contentid,
            title: item.title,
            addr1: item.addr1,
            type: type
        }));
    }
    return [];
}

// 기존 analyzeData 함수는 동일...
async function analyzeData(apiKey, contentId, contentTypeId, typeName) {
    // ... (이전과 동일한 코드)
}
