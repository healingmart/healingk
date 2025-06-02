// api/test.js (안전한 단순 버전)

const AREA_CODES = {
  '서울': 1, '부산': 6, '대구': 4, '인천': 2, '광주': 5, '대전': 3, '울산': 7,
  '경기': 31, '강원': 32, '충북': 33, '충남': 34, '전북': 37, '전남': 38, 
  '경북': 35, '경남': 36, '제주': 39
};

const CONTENT_TYPES = {
  '관광지': 12, '문화시설': 14, '축제공연행사': 15, '여행코스': 25,
  '레포츠': 28, '숙박': 32, '쇼핑': 38, '음식점': 39
};

const CATEGORY_MAPPING = {
  'accommodation': '숙박',
  'attractions': '관광지',
  'restaurants': '음식점',
  'culture': '문화시설',
  'festivals': '축제공연행사'
};

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const startTime = Date.now();
        const { 
            region = '서울', 
            category = 'accommodation',
            test = 'basic'  // basic, detail1, detail2, detail3
        } = req.query;
        
        console.log(`🚀 안전한 테스트: ${test}`);

        // API 키 확인
        const apiKey = getAPIKey();
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                message: '❌ API 키 없음'
            });
        }

        // 기본 데이터 수집
        const basicData = await getBasicData(apiKey, region, category);
        if (!basicData.success) {
            return res.status(200).json({
                success: false,
                message: '❌ 기본 데이터 실패',
                error: basicData.error
            });
        }

        const testAttraction = basicData.attractions[0];
        const contentId = testAttraction.id;

        // 테스트 타입별 분기
        let detailResult = null;
        
        if (test === 'detail1') {
            // contentTypeId 없이 시도
            detailResult = await testDetailSimple(apiKey, contentId, null);
        } else if (test === 'detail2') {
            // contentTypeId = 12 (관광지)
            detailResult = await testDetailSimple(apiKey, contentId, '12');
        } else if (test === 'detail3') {
            // contentTypeId = 32 (숙박)
            detailResult = await testDetailSimple(apiKey, contentId, '32');
        }

        if (detailResult) {
            testAttraction.detailResult = detailResult;
        }

        return res.status(200).json({
            success: true,
            data: {
                region,
                category,
                test,
                attraction: testAttraction,
                contentId
            },
            message: `✅ ${test} 테스트 완료`,
            responseTime: `${Date.now() - startTime}ms`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 테스트 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            message: '❌ 테스트 실패'
        });
    }
};

// ===== 기본 데이터 수집 =====
async function getBasicData(apiKey, region, category) {
    const areaCode = AREA_CODES[region] || 1;
    const contentType = CATEGORY_MAPPING[category] || '관광지';
    const contentTypeId = CONTENT_TYPES[contentType] || 32;

    const params = new URLSearchParams({
        serviceKey: apiKey,
        numOfRows: '1',
        pageNo: '1',
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentTypeId: contentTypeId.toString(),
        areaCode: areaCode.toString()
    });

    try {
        const url = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?${params.toString()}`;
        const response = await fetch(url, { timeout: 8000 });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (data.response?.header?.resultCode === '0000') {
            const items = data.response.body?.items?.item || [];
            const itemsArray = Array.isArray(items) ? items : [items];
            
            const attractions = itemsArray.map((item, index) => ({
                id: item.contentid || `test_${index}`,
                title: item.title || `테스트 ${index + 1}`,
                category: item.cat3 || category,
                address: item.addr1 || '주소 없음',
                tel: item.tel || '전화 없음'
            }));
            
            return { success: true, attractions };
        }

        throw new Error(data.response?.header?.resultMsg || '데이터 없음');
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ===== DetailCommon 단순 테스트 =====
async function testDetailSimple(apiKey, contentId, contentTypeId) {
    console.log(`🔍 DetailCommon 단순 테스트: ID=${contentId}, TypeID=${contentTypeId || '없음'}`);
    
    const params = new URLSearchParams({
        serviceKey: apiKey,
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentId: contentId,
        defaultYN: 'Y',
        overviewYN: 'Y'
    });
    
    // contentTypeId가 있을 때만 추가
    if (contentTypeId) {
        params.append('contentTypeId', contentTypeId);
    }

    try {
        const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?${params.toString()}`;
        console.log(`📡 URL: ${url.substring(0, 120)}...`);
        
        const response = await fetch(url, { timeout: 8000 });
        console.log(`📊 응답: ${response.status}`);
        
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }

        const responseText = await response.text();
        console.log(`📝 응답 길이: ${responseText.length}자`);
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            return { success: false, error: `JSON 파싱 실패: ${parseError.message}` };
        }
        
        // 응답 구조 확인 (기존에서 발견한 구조 사용)
        const resultCode = data.resultCode || data.response?.header?.resultCode;
        const resultMsg = data.resultMsg || data.response?.header?.resultMsg;
        
        console.log(`📊 결과: ${resultCode} - ${resultMsg}`);
        
        if (resultCode === '0' || resultCode === '0000') {
            console.log(`🎉 성공! 응답 키들: ${Object.keys(data).join(', ')}`);
            
            // 데이터 찾기
            let item = data.response?.body?.items?.item || data.items?.item || data.item;
            
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                return {
                    success: true,
                    contentTypeId: contentTypeId || 'none',
                    hasOverview: !!itemData.overview,
                    hasTel: !!itemData.tel,
                    hasHomepage: !!itemData.homepage,
                    sampleOverview: itemData.overview?.substring(0, 50) || null,
                    dataKeys: Object.keys(itemData)
                };
            } else {
                return { success: false, error: '성공했지만 Item 없음' };
            }
        } else {
            return { 
                success: false, 
                error: `API 오류: ${resultCode} - ${resultMsg}`,
                contentTypeId: contentTypeId || 'none'
            };
        }

    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ===== API 키 확인 =====
function getAPIKey() {
    const keys = [
        process.env.TOURISM_API_KEY,
        process.env.TOUR_API_KEY,
        process.env.JEONBUK_API_KEY,
        process.env.WEATHER_API_KEY,
        process.env.REGIONAL_API_KEY
    ];
    
    return keys.find(key => key && key.length > 10);
}
