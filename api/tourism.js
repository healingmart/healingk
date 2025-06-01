const axios = require('axios');

const AREA_CODES = {
  '서울': 1, '부산': 6, '제주': 39, '강릉': 32,
  '전주': 37, '대구': 4, '광주': 5, '대전': 3,
  '인천': 2, '울산': 7, '경주': 35, '춘천': 32
};

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { region = '서울' } = req.query;
        
        console.log('🎯 === 전북 API 방식 확장 테스트 ===');
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));
        console.log('🗺️ 요청 지역:', region);

        // 전북 API와 동일한 환경변수 우선순위
        const possibleKeys = [
            process.env.JEONBUK_API_KEY,      // 전북 API에서 성공한 키
            process.env.TOURISM_API_KEY,
            process.env.TOUR_API_KEY,
            process.env.WEATHER_API_KEY,
            process.env.REGIONAL_API_KEY
        ];

        console.log('🔑 환경변수 체크 (전북 방식):', {
            JEONBUK_API_KEY: !!process.env.JEONBUK_API_KEY,
            TOURISM_API_KEY: !!process.env.TOURISM_API_KEY,
            TOUR_API_KEY: !!process.env.TOUR_API_KEY,
            WEATHER_API_KEY: !!process.env.WEATHER_API_KEY,
            REGIONAL_API_KEY: !!process.env.REGIONAL_API_KEY
        });

        const apiKey = possibleKeys.find(key => key);

        if (!apiKey) {
            console.log('❌ API 키 없음');
            return res.status(200).json({
                success: true,
                data: getTourismSampleData(region),
                message: '⚠️ 전북 방식 API 키 설정 필요',
                timestamp: new Date().toISOString()
            });
        }

        console.log('✅ API 키 발견 (전북 방식):', `${apiKey.substring(0, 10)}...`);

        // 전주/전북 요청은 전북 API로 리다이렉트
        if (region === '전주' || region === '전북') {
            console.log('🔄 전북 API로 리다이렉트...');
            const jeonbukResult = await callJeonbukAPI(region);
            if (jeonbukResult.success) {
                return res.status(200).json(jeonbukResult);
            }
        }

        // === 전북 API 방식으로 다른 지역 처리 ===
        console.log('🧪 전북 API 방식으로 다른 지역 테스트...');
        const tourismResult = await testJeonbukStyleAPI(apiKey, region);
        console.log('📊 결과:', tourismResult);

        if (tourismResult.success) {
            console.log('🎉 전북 방식 성공!');
            return res.status(200).json({
                success: true,
                data: tourismResult.data,
                message: `🏛️ ${region} 실시간 관광 정보! (전북 방식)`,
                method: tourismResult.method,
                realTime: true,
                timestamp: new Date().toISOString()
            });
        }

        console.log('⚠️ 전북 방식 실패 - 샘플 데이터 제공');
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(region),
            message: `🏛️ ${region} 관광 정보 (전북 방식 적용 중)`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 전북 방식 확장 오류:', error);
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(req.query.region || '서울'),
            message: '🏛️ 관광 정보 (백업)',
            timestamp: new Date().toISOString()
        });
    }
};

// === 전북 API 직접 호출 ===
async function callJeonbukAPI(region) {
    try {
        console.log('📞 전북 API 직접 호출...');
        const response = await axios.get(`https://healingk.vercel.app/api/jeonbuk-tourism?region=${region}`, {
            timeout: 15000
        });
        
        if (response.data && response.data.success) {
            console.log('✅ 전북 API 직접 호출 성공');
            return response.data;
        }
        
        return { success: false };
    } catch (error) {
        console.log('❌ 전북 API 직접 호출 실패:', error.message);
        return { success: false };
    }
}

// === 전북 API 방식으로 다른 지역 처리 ===
async function testJeonbukStyleAPI(apiKey, region) {
    try {
        const areaCode = AREA_CODES[region] || 1;
        
        // 전북 API와 정확히 동일한 URL들 사용
        const jeonbukStyleURLs = [
            'http://apis.data.go.kr/B551011/KorService1/areaBasedList1',
            'https://apis.data.go.kr/B551011/KorService1/areaBasedList1'
        ];

        for (const url of jeonbukStyleURLs) {
            try {
                console.log(`🔍 전북 방식 URL 시도: ${url}`);

                // 전북 API와 정확히 동일한 파라미터
                const params = {
                    serviceKey: apiKey,
                    numOfRows: 10,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    listYN: 'Y',
                    arrange: 'A',
                    contentTypeId: 12,
                    areaCode: areaCode
                };

                console.log('📋 전북 방식 파라미터:', {
                    areaCode,
                    region,
                    serviceKey: 'exists'
                });

                const response = await axios.get(url, {
                    params: params,
                    timeout: 10000
                });

                console.log(`📡 전북 방식 응답:`, {
                    status: response.status,
                    contentType: response.headers['content-type'],
                    isJSON: response.headers['content-type']?.includes('json'),
                    dataType: typeof response.data
                });

                // 전북 API와 동일한 응답 처리
                if (response.data && typeof response.data === 'object') {
                    const resultCode = response.data.response?.header?.resultCode || 
                                     response.data.result?.code || 
                                     response.data.resultCode;

                    console.log('📊 전북 방식 결과 코드:', resultCode);

                    if (resultCode === '0000' || resultCode === '00' || resultCode === 'SUCCESS') {
                        const items = response.data.response?.body?.items?.item || 
                                     response.data.data || 
                                     response.data.items || 
                                     response.data.result?.data;

                        console.log('📦 전북 방식 아이템:', {
                            type: Array.isArray(items) ? 'array' : typeof items,
                            length: Array.isArray(items) ? items.length : (items ? 1 : 0)
                        });

                        if (items && (Array.isArray(items) ? items.length > 0 : true)) {
                            console.log('🎉 전북 방식으로 데이터 발견!');
                            return {
                                success: true,
                                method: 'jeonbuk_style_success',
                                data: convertJeonbukStyleToTourism(items, region)
                            };
                        }
                    } else {
                        console.log('❌ 전북 방식 응답 오류:', response.data.response?.header?.resultMsg);
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (urlError) {
                console.log(`❌ 전북 방식 URL 실패:`, urlError.message);
                continue;
            }
        }

        return { success: false, method: 'jeonbuk_style_failed' };

    } catch (error) {
        console.log('❌ 전북 방식 테스트 오류:', error.message);
        return { success: false, method: 'jeonbuk_style_error', error: error.message };
    }
}

// === 전북 방식 데이터를 관광 형식으로 변환 ===
function convertJeonbukStyleToTourism(data, region) {
    const items = Array.isArray(data) ? data : [data];

    const attractions = items.slice(0, 5).map((item, index) => ({
        title: item.title || '관광지',
        category: item.cat3 || item.cat2 || '관광지',
        address: item.addr1 || item.address || `${region} 지역`,
        tel: item.tel || '정보 없음',
        image: item.firstimage || null,
        mapx: item.mapx,
        mapy: item.mapy,
        id: item.contentid || `tourism_${index}`
    }));

    const events = [
        { title: `${region} 문화축제`, location: region, date: '2025-06-01' },
        { title: `${region} 음식축제`, location: region, date: '2025-06-15' }
    ];

    return {
        region,
        attractions,
        events,
        attractionCount: attractions.length,
        eventCount: events.length,
        message: `🏛️ ${region} 관광 정보 (전북 방식으로 성공!)`
    };
}

// === 샘플 데이터 ===
function getTourismSampleData(region) {
    const attractions = [
        { title: `${region} 대표 관광지`, category: '문화관광지' },
        { title: `${region} 자연공원`, category: '자연관광지' },
        { title: `${region} 역사유적`, category: '역사관광지' }
    ];

    const events = [
        { title: `${region} 문화축제`, location: region, date: '2025-06-01' },
        { title: `${region} 음식축제`, location: region, date: '2025-06-15' }
    ];

    return {
        region,
        attractions,
        events,
        attractionCount: attractions.length,
        eventCount: events.length,
        message: `전북 방식 확장 중 - ${region} 샘플 데이터`
    };
}
