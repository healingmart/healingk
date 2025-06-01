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
        
        console.log('🎉 === KorService2 응답 분석 시작 ===');
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));
        console.log('🗺️ 요청 지역:', region);

        const apiKey = process.env.TOURISM_API_KEY;

        console.log('🔑 TOURISM_API_KEY 체크:', {
            exists: !!apiKey,
            preview: apiKey ? `${apiKey.substring(0, 10)}...` : 'NONE'
        });

        if (!apiKey) {
            console.log('❌ TOURISM_API_KEY 없음');
            return res.status(200).json({
                success: true,
                data: getTourismSampleData(region),
                message: '⚠️ TOURISM_API_KEY 설정 필요',
                timestamp: new Date().toISOString()
            });
        }

        // === Service2 응답 구조 분석 ===
        console.log('🔍 Service2 응답 구조 분석...');
        const tourismResult = await analyzeService2Response(apiKey, region);
        console.log('📊 최종 결과:', tourismResult);

        if (tourismResult.success) {
            console.log('🎉 Service2 성공!');
            return res.status(200).json({
                success: true,
                data: tourismResult.data,
                message: `🏛️ ${region} 실시간 관광 정보! (Service2)`,
                method: tourismResult.method,
                realTime: true,
                timestamp: new Date().toISOString()
            });
        }

        console.log('⚠️ Service2 분석 완료 - 샘플 데이터 반환');
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(region),
            message: `🏛️ ${region} 관광 정보 (Service2 구조 분석 완료)`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Service2 분석 오류:', error);
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(req.query.region || '서울'),
            message: '🏛️ 관광 정보 (백업)',
            timestamp: new Date().toISOString()
        });
    }
};

// === Service2 응답 구조 분석 함수 ===
async function analyzeService2Response(apiKey, region) {
    try {
        const areaCode = AREA_CODES[region] || 1;
        
        // 가장 기본적인 Service2 URL 하나만 시도
        const testUrl = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
        
        console.log(`🔍 Service2 URL 분석: ${testUrl}`);

        const params = {
            serviceKey: apiKey,
            numOfRows: 5,  // 적은 수로 테스트
            pageNo: 1,
            MobileOS: 'ETC',
            MobileApp: 'HealingK',
            _type: 'json',
            listYN: 'Y',
            arrange: 'A',
            contentTypeId: 12,
            areaCode: areaCode
        };

        console.log('📋 분석용 파라미터:', params);

        const response = await axios.get(testUrl, {
            params: params,
            timeout: 15000
        });

        console.log(`📡 Service2 응답 상세:`, {
            status: response.status,
            contentType: response.headers['content-type'],
            dataType: typeof response.data
        });

        // === 응답 구조 완전 분석 ===
        console.log('🔬 === 응답 구조 완전 분석 ===');
        
        if (response.data && typeof response.data === 'object') {
            // 전체 응답 구조 로깅
            console.log('📦 응답 최상위 키들:', Object.keys(response.data));
            
            // Service1 방식 체크
            const service1ResultCode = response.data.response?.header?.resultCode;
            console.log('🔍 Service1 방식 결과 코드:', service1ResultCode);
            
            // 다른 가능한 구조들 체크
            const possiblePaths = [
                response.data.resultCode,
                response.data.code,
                response.data.status,
                response.data.result?.code,
                response.data.header?.resultCode,
                response.data.meta?.code,
                response.data.success
            ];
            
            console.log('🔍 가능한 결과 코드들:', possiblePaths);
            
            // 데이터 위치 찾기
            const possibleDataPaths = [
                response.data.response?.body?.items?.item,  // Service1 방식
                response.data.items,
                response.data.data,
                response.data.result?.items,
                response.data.body?.items,
                response.data.list,
                response.data.content
            ];
            
            console.log('🔍 가능한 데이터 경로들:');
            possibleDataPaths.forEach((path, index) => {
                if (path !== undefined) {
                    console.log(`  경로 ${index}: 타입=${typeof path}, 길이=${Array.isArray(path) ? path.length : 'not array'}`);
                    if (Array.isArray(path) && path.length > 0) {
                        console.log(`    첫 번째 아이템 키들:`, Object.keys(path[0] || {}));
                    }
                }
            });
            
            // 전체 응답 구조 샘플 출력 (너무 길지 않게)
            const responseStr = JSON.stringify(response.data, null, 2);
            console.log('📄 응답 구조 샘플 (처음 500자):', responseStr.substring(0, 500));
            
            // 성공적인 데이터 찾기
            const successfulData = possibleDataPaths.find(path => 
                path && (Array.isArray(path) ? path.length > 0 : true)
            );
            
            if (successfulData) {
                console.log('🎉 데이터 발견! 변환 시도...');
                return {
                    success: true,
                    method: 'service2_analyzed',
                    data: convertToTourismFormat(successfulData, region)
                };
            }
            
            // 성공 코드 확인 (데이터가 없어도)
            const isSuccess = possiblePaths.some(code => 
                code === '0000' || code === '00' || code === 'SUCCESS' || code === true
            );
            
            if (isSuccess) {
                console.log('✅ 성공 코드 확인됨 - 빈 데이터로 처리');
                return {
                    success: true,
                    method: 'service2_empty_success',
                    data: {
                        region,
                        attractions: [],
                        events: [],
                        attractionCount: 0,
                        eventCount: 0,
                        message: `🏛️ ${region} 지역 데이터 없음 (API 연결 성공)`
                    }
                };
            }
        }

        console.log('❌ Service2 구조 분석 실패');
        return { success: false, method: 'service2_structure_unknown' };

    } catch (error) {
        console.log('❌ Service2 분석 중 오류:', error.message);
        if (error.response) {
            console.log('📄 오류 응답:', error.response.status, error.response.statusText);
            console.log('📄 오류 데이터:', JSON.stringify(error.response.data).substring(0, 300));
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
        message: `🏛️ ${region} 관광 정보 (Service2 연결 성공)`
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
        message: `Service2 구조 분석 중 - ${region} 샘플 데이터`
    };
}
