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
        
        console.log('🔍 === Service2 응답 데이터 직접 출력 ===');
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));
        console.log('🗺️ 요청 지역:', region);

        const apiKey = process.env.TOURISM_API_KEY;

        if (!apiKey) {
            return res.status(200).json({
                success: true,
                data: getTourismSampleData(region),
                message: '⚠️ TOURISM_API_KEY 설정 필요',
                timestamp: new Date().toISOString()
            });
        }

        console.log('✅ API 키 존재:', `${apiKey.substring(0, 10)}...`);

        // === 실제 응답 데이터 출력 ===
        const tourismResult = await directResponseOutput(apiKey, region);

        if (tourismResult.success) {
            return res.status(200).json({
                success: true,
                data: tourismResult.data,
                message: `🏛️ ${region} 실시간 관광 정보! (Service2)`,
                method: tourismResult.method,
                realTime: true,
                timestamp: new Date().toISOString()
            });
        }

        return res.status(200).json({
            success: true,
            data: getTourismSampleData(region),
            message: `🏛️ ${region} 관광 정보 (Service2 응답 구조 확인 중)`,
            debug: tourismResult.debug || 'no debug info',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 오류:', error);
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(req.query.region || '서울'),
            message: '🏛️ 관광 정보 (백업)',
            timestamp: new Date().toISOString()
        });
    }
};

// === 응답 데이터 직접 출력 함수 ===
async function directResponseOutput(apiKey, region) {
    try {
        const areaCode = AREA_CODES[region] || 1;
        const testUrl = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
        
        console.log('🎯 테스트 URL:', testUrl);
        console.log('🎯 지역 코드:', areaCode);

        const params = {
            serviceKey: apiKey,
            numOfRows: 3,
            pageNo: 1,
            MobileOS: 'ETC',
            MobileApp: 'HealingK',
            _type: 'json',
            listYN: 'Y',
            arrange: 'A',
            contentTypeId: 12,
            areaCode: areaCode
        };

        console.log('📋 요청 파라미터:', JSON.stringify(params, null, 2));

        const response = await axios.get(testUrl, {
            params: params,
            timeout: 15000
        });

        console.log('📡 === 응답 상태 ===');
        console.log('상태 코드:', response.status);
        console.log('Content-Type:', response.headers['content-type']);
        console.log('데이터 타입:', typeof response.data);

        console.log('📦 === 실제 응답 데이터 ===');
        console.log('전체 응답:', JSON.stringify(response.data, null, 2));

        // 응답이 객체인 경우
        if (response.data && typeof response.data === 'object') {
            console.log('🔑 === 최상위 키들 ===');
            const topKeys = Object.keys(response.data);
            console.log('키 목록:', topKeys);

            // 각 키의 값 타입 확인
            topKeys.forEach(key => {
                const value = response.data[key];
                console.log(`${key}: ${typeof value} ${Array.isArray(value) ? `(배열, 길이: ${value.length})` : ''}`);
                
                // 객체인 경우 하위 키들도 확인
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    console.log(`  └ ${key} 하위 키들:`, Object.keys(value));
                }
            });

            // 데이터 찾기 시도
            console.log('🔍 === 데이터 찾기 시도 ===');
            
            // 가능한 모든 경로 시도
            const dataPaths = [
                ['response', 'body', 'items', 'item'],
                ['items'],
                ['data'],
                ['result'],
                ['body', 'items'],
                ['content'],
                ['list']
            ];

            let foundData = null;
            let foundPath = null;

            for (const path of dataPaths) {
                let current = response.data;
                let pathStr = 'response.data';
                
                for (const key of path) {
                    if (current && typeof current === 'object' && key in current) {
                        current = current[key];
                        pathStr += `.${key}`;
                    } else {
                        current = null;
                        break;
                    }
                }
                
                if (current) {
                    console.log(`✅ 데이터 발견: ${pathStr}`);
                    console.log(`   타입: ${typeof current}, 배열: ${Array.isArray(current)}, 길이: ${Array.isArray(current) ? current.length : 'N/A'}`);
                    
                    if (Array.isArray(current) && current.length > 0) {
                        console.log(`   첫 번째 항목:`, JSON.stringify(current[0], null, 2));
                        foundData = current;
                        foundPath = pathStr;
                        break;
                    } else if (!Array.isArray(current) && typeof current === 'object') {
                        console.log(`   객체 내용:`, JSON.stringify(current, null, 2));
                        foundData = [current]; // 단일 객체를 배열로 변환
                        foundPath = pathStr;
                        break;
                    }
                }
            }

            if (foundData) {
                console.log('🎉 성공! 데이터 변환 시도...');
                return {
                    success: true,
                    method: 'service2_direct_found',
                    data: convertToTourismFormat(foundData, region),
                    debug: `데이터 경로: ${foundPath}`
                };
            }

            // 성공 코드라도 확인
            const possibleCodes = [
                response.data.response?.header?.resultCode,
                response.data.resultCode,
                response.data.code,
                response.data.status
            ];

            console.log('📊 결과 코드들:', possibleCodes);

            return {
                success: false,
                method: 'service2_no_data_found',
                debug: {
                    topKeys: topKeys,
                    resultCodes: possibleCodes,
                    fullResponse: JSON.stringify(response.data).substring(0, 500)
                }
            };
        }

        return { success: false, method: 'service2_not_object' };

    } catch (error) {
        console.log('❌ 직접 출력 중 오류:', error.message);
        if (error.response) {
            console.log('📄 오류 응답 상태:', error.response.status);
            console.log('📄 오류 응답 데이터:', JSON.stringify(error.response.data, null, 2));
        }
        return { success: false, method: 'service2_error', error: error.message };
    }
}

// === 데이터 변환 함수 ===
function convertToTourismFormat(data, region) {
    const items = Array.isArray(data) ? data : [data];

    const attractions = items.slice(0, 5).map((item, index) => ({
        title: item.title || item.name || `${region} 관광지 ${index + 1}`,
        category: item.cat3 || item.cat2 || item.category || '관광지',
        address: item.addr1 || item.address || item.location || `${region} 지역`,
        tel: item.tel || item.phone || '정보 없음',
        image: item.firstimage || item.image || null,
        mapx: item.mapx || item.longitude,
        mapy: item.mapy || item.latitude,
        id: item.contentid || item.id || `tourism_${index}`
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
        message: `🏛️ ${region} 관광 정보 (Service2 성공!)`
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
        message: `Service2 응답 분석 중 - ${region} 샘플 데이터`
    };
}
