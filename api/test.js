// api/test.js (안전한 간단 버전)

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
  'festivals': '축제공연행사',
  'accommodation': '숙박',
  'restaurants': '음식점',
  'culture': '문화시설',
  'attractions': '관광지'
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
            numOfRows = 1,  // 안전하게 1개만
            detail = 'simple'
        } = req.query;
        
        console.log('🚀 안전한 테스트 시작');
        console.log(`지역: ${region}, 카테고리: ${category}`);

        // API 키 확인
        const apiKey = getAPIKey();
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                message: '❌ API 키 없음'
            });
        }

        console.log('✅ API 키 확인됨');

        // 1단계: 기본 목록만 가져오기
        const basicData = await getBasicTourismData(apiKey, region, category, numOfRows);
        
        if (!basicData.success) {
            return res.status(200).json({
                success: false,
                message: '❌ 기본 데이터 수집 실패',
                debug: basicData.error
            });
        }

        console.log(`✅ 기본 데이터 ${basicData.attractions.length}개 수집`);

        // 2단계: 첫 번째 항목만 상세 정보 시도
        let testAttraction = basicData.attractions[0];
        
        if (detail === 'test' && testAttraction) {
            console.log(`🔍 ${testAttraction.title} 상세 정보 시도`);
            
            try {
                const detailResult = await testDetailCommon(apiKey, testAttraction.id);
                testAttraction.detailTest = detailResult;
                console.log(`📋 DetailCommon 테스트: ${detailResult.success ? '성공' : '실패'}`);
            } catch (error) {
                console.log(`❌ DetailCommon 테스트 오류: ${error.message}`);
                testAttraction.detailTest = { success: false, error: error.message };
            }
        }

        const responseTime = Date.now() - startTime;

        return res.status(200).json({
            success: true,
            data: {
                region,
                category,
                attractions: basicData.attractions,
                count: basicData.attractions.length
            },
            message: `✅ ${region} ${category} 안전 테스트 완료`,
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 안전 테스트 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            message: '❌ 안전 테스트 실패',
            timestamp: new Date().toISOString()
        });
    }
};

// ===== 기본 관광 데이터 수집 =====
async function getBasicTourismData(apiKey, region, category, numOfRows) {
    const areaCode = AREA_CODES[region] || 1;
    const contentType = CATEGORY_MAPPING[category] || '관광지';
    const contentTypeId = CONTENT_TYPES[contentType] || 32;
    
    console.log(`📋 기본 API 호출: 지역=${areaCode}, 타입=${contentTypeId}`);

    const params = new URLSearchParams({
        serviceKey: apiKey,
        numOfRows: numOfRows.toString(),
        pageNo: '1',
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentTypeId: contentTypeId.toString(),
        areaCode: areaCode.toString()
    });

    try {
        const url = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?${params.toString()}`;
        console.log(`📡 요청 URL: ${url.substring(0, 120)}...`);
        
        const response = await fetch(url, { timeout: 10000 });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(`📦 응답 코드: ${data.response?.header?.resultCode}`);
        
        if (data.response?.header?.resultCode === '0000') {
            const items = data.response.body?.items?.item || [];
            const itemsArray = Array.isArray(items) ? items : [items];
            
            const attractions = itemsArray.map((item, index) => ({
                id: item.contentid || `test_${index}`,
                title: item.title || `테스트 ${index + 1}`,
                category: item.cat3 || category,
                address: item.addr1 || '주소 없음',
                tel: item.tel || '전화 없음',
                image: item.firstimage || null,
                mapx: item.mapx || null,
                mapy: item.mapy || null
            }));
            
            return { success: true, attractions };
        }

        throw new Error(data.response?.header?.resultMsg || '데이터 없음');
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ===== DetailCommon 간단 테스트 =====
async function testDetailCommon(apiKey, contentId) {
    console.log(`🔍 DetailCommon 테스트: ID=${contentId}`);
    
    const params = new URLSearchParams({
        serviceKey: apiKey,
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentId: contentId,
        contentTypeId: '32',  // 숙박시설
        defaultYN: 'Y',
        overviewYN: 'Y'
    });

    try {
        const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?${params.toString()}`;
        console.log(`📡 DetailCommon URL: ${url.substring(0, 120)}...`);
        
        const response = await fetch(url, { timeout: 8000 });
        console.log(`📊 DetailCommon 응답: ${response.status}`);
        
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        const resultCode = data.response?.header?.resultCode;
        console.log(`📋 DetailCommon 결과: ${resultCode}`);
        
        if (resultCode === '0000') {
            const item = data.response.body?.items?.item;
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                return {
                    success: true,
                    hasOverview: !!itemData.overview,
                    overviewLength: itemData.overview?.length || 0,
                    hasTel: !!itemData.tel,
                    hasHomepage: !!itemData.homepage,
                    hasUseTime: !!itemData.usetime,
                    sampleData: {
                        overview: itemData.overview?.substring(0, 100) || null,
                        tel: itemData.tel || null,
                        homepage: itemData.homepage || null
                    }
                };
            }
        }

        return { success: false, error: `API 오류: ${resultCode}` };
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
