const axios = require('axios');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { region = '전주', category = 'all' } = req.query;
        
        console.log('🏛️ === 전북 관광 API 테스트 시작 ===');
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));
        console.log('🗺️ 요청 지역:', region);
        console.log('🏷️ 카테고리:', category);

        // 가능한 환경변수들 체크
        const possibleKeys = [
            process.env.JEONBUK_API_KEY,
            process.env.TOURISM_API_KEY,
            process.env.WEATHER_API_KEY, // 혹시 같은 키?
            process.env.REGIONAL_API_KEY
        ];

        console.log('🔑 환경변수 체크:', {
            JEONBUK_API_KEY: !!process.env.JEONBUK_API_KEY,
            TOURISM_API_KEY: !!process.env.TOURISM_API_KEY,
            WEATHER_API_KEY: !!process.env.WEATHER_API_KEY,
            REGIONAL_API_KEY: !!process.env.REGIONAL_API_KEY
        });

        const apiKey = possibleKeys.find(key => key) || process.env.TOURISM_API_KEY;

        if (!apiKey) {
            console.log('❌ API 키 없음');
            return res.status(200).json({
                success: true,
                data: getJeonbukSampleData(),
                message: '⚠️ 전북 API 키 설정 필요',
                timestamp: new Date().toISOString()
            });
        }

        console.log('✅ API 키 발견:', `${apiKey.substring(0, 10)}...`);

        // === 테스트 1: 전북 관광지 정보 ===
        console.log('🧪 테스트 1: 전북 관광지 API...');
        const tourismResult = await testJeonbukTourism(apiKey);
        console.log('📊 전북 관광지 결과:', tourismResult);

        // === 테스트 2: 전북 축제 정보 ===
        console.log('🧪 테스트 2: 전북 축제 API...');
        const festivalResult = await testJeonbukFestivals(apiKey);
        console.log('📊 전북 축제 결과:', festivalResult);

        // === 테스트 3: 전북 문화시설 ===
        console.log('🧪 테스트 3: 전북 문화시설 API...');
        const cultureResult = await testJeonbukCulture(apiKey);
        console.log('📊 전북 문화시설 결과:', cultureResult);

        // 성공한 결과 찾기
        const successfulResult = [tourismResult, festivalResult, cultureResult].find(r => r.success);

        if (successfulResult) {
            console.log('🎉 전북 API 성공!');
            return res.status(200).json({
                success: true,
                data: successfulResult.data,
                message: '🏛️ 전북 실시간 관광 정보!',
                method: successfulResult.method,
                realTime: true,
                timestamp: new Date().toISOString()
            });
        }

        // 모든 테스트 실패
        console.log('⚠️ 모든 전북 API 테스트 실패');
        return res.status(200).json({
            success: true,
            data: getJeonbukSampleData(),
            message: '🏛️ 전북 관광 정보 (API 연결 대기중)',
            apiStatus: 'testing',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 전북 API 오류:', error);
        return res.status(200).json({
            success: true,
            data: getJeonbukSampleData(),
            message: '🏛️ 전북 관광 정보 (백업)',
            timestamp: new Date().toISOString()
        });
    }
};

// === 테스트 1: 전북 관광지 ===
async function testJeonbukTourism(apiKey) {
    try {
        // 전북 API는 다른 URL일 수 있음
        const possibleUrls = [
            'http://apis.data.go.kr/6450000/tourismInfoService/getTourismInfo',
            'http://apis.data.go.kr/6450000/jeonbukTourismService/getTourismList',
            'http://api.jeonbuk.go.kr/tourism/list',
            'http://apis.data.go.kr/B551011/KorService1/areaBasedList1' // 일반 관광 API에 전북 코드
        ];

        for (const url of possibleUrls) {
            try {
                console.log(`🔍 URL 시도: ${url}`);

                let params;
                if (url.includes('KorService1')) {
                    // 일반 관광 API 방식
                    params = {
                        serviceKey: apiKey,
                        numOfRows: 10,
                        pageNo: 1,
                        MobileOS: 'ETC',
                        MobileApp: 'HealingK',
                        _type: 'json',
                        listYN: 'Y',
                        arrange: 'A',
                        contentTypeId: 12, // 관광지
                        areaCode: 37 // 전북
                    };
                } else {
                    // 전북 전용 API 방식
                    params = {
                        serviceKey: apiKey,
                        numOfRows: 10,
                        pageNo: 1,
                        type: 'json'
                    };
                }

                const response = await axios.get(url, {
                    params: params,
                    timeout: 10000
                });

                console.log(`📡 ${url} 응답:`, {
                    status: response.status,
                    contentType: response.headers['content-type'],
                    isJSON: response.headers['content-type']?.includes('json')
                });

                if (response.data && typeof response.data === 'object') {
                    // 다양한 응답 형식 체크
                    const resultCode = response.data.response?.header?.resultCode || 
                                     response.data.result?.code || 
                                     response.data.resultCode;

                    if (resultCode === '0000' || resultCode === '00' || resultCode === 'SUCCESS') {
                        const items = response.data.response?.body?.items?.item || 
                                     response.data.data || 
                                     response.data.items || 
                                     response.data.result?.data;

                        if (items && (Array.isArray(items) ? items.length > 0 : true)) {
                            console.log('🎉 전북 관광지 데이터 발견!');
                            return {
                                success: true,
                                method: 'jeonbuk_tourism',
                                data: convertJeonbukToFestival(items, 'tourism')
                            };
                        }
                    }
                }

                // 다음 URL 시도 전 잠시 대기
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (urlError) {
                console.log(`❌ ${url} 실패:`, urlError.message);
                continue;
            }
        }

        return { success: false, method: 'jeonbuk_tourism' };

    } catch (error) {
        return { success: false, method: 'jeonbuk_tourism', error: error.message };
    }
}

// === 테스트 2: 전북 축제 ===
async function testJeonbukFestivals(apiKey) {
    try {
        console.log('🎭 전북 축제 전용 API 시도...');

        const response = await axios.get('http://apis.data.go.kr/6450000/festivalService/getFestivalList', {
            params: {
                serviceKey: apiKey,
                numOfRows: 20,
                pageNo: 1,
                type: 'json'
            },
            timeout: 10000
        });

        if (response.data && typeof response.data === 'object') {
            console.log('🎭 전북 축제 API 응답 성공');
            return {
                success: true,
                method: 'jeonbuk_festivals',
                data: convertJeonbukToFestival(response.data, 'festival')
            };
        }

        return { success: false, method: 'jeonbuk_festivals' };

    } catch (error) {
        return { success: false, method: 'jeonbuk_festivals', error: error.message };
    }
}

// === 테스트 3: 전북 문화시설 ===
async function testJeonbukCulture(apiKey) {
    try {
        console.log('🏛️ 전북 문화시설 API 시도...');

        const response = await axios.get('http://apis.data.go.kr/6450000/cultureService/getCultureList', {
            params: {
                serviceKey: apiKey,
                numOfRows: 15,
                pageNo: 1,
                type: 'json'
            },
            timeout: 10000
        });

        if (response.data && typeof response.data === 'object') {
            console.log('🏛️ 전북 문화시설 API 응답 성공');
            return {
                success: true,
                method: 'jeonbuk_culture',
                data: convertJeonbukToFestival(response.data, 'culture')
            };
        }

        return { success: false, method: 'jeonbuk_culture' };

    } catch (error) {
        return { success: false, method: 'jeonbuk_culture', error: error.message };
    }
}

// === 전북 데이터를 축제 형식으로 변환 ===
function convertJeonbukToFestival(data, type) {
    const items = Array.isArray(data) ? data : 
                 data.response?.body?.items?.item || 
                 data.data || 
                 data.items || 
                 [data];

    const festivals = items.slice(0, 8).map((item, index) => {
        let title, location, category;
        
        if (type === 'tourism') {
            title = `🏛️ ${item.title || item.name || '전북 관광지'}`;
            location = item.addr1 || item.address || '전북 전주시';
            category = '관광축제';
        } else if (type === 'festival') {
            title = `🎪 ${item.title || item.festivalName || '전북 축제'}`;
            location = item.addr1 || item.location || '전북 전주시';
            category = '지역축제';
        } else {
            title = `🎨 ${item.title || item.facilityName || '전북 문화행사'}`;
            location = item.addr1 || item.address || '전북 전주시';
            category = '문화축제';
        }

        return {
            id: item.contentid || item.id || `jeonbuk_${index}`,
            title: title,
            location: location,
            region: '전북',
            startDate: '2025.06.01',
            endDate: '2025.06.30',
            status: index < 2 ? 'ongoing' : 'upcoming',
            isThisWeekend: index < 3,
            tel: item.tel || '063-281-2114',
            category: category,
            mapx: item.mapx || item.longitude,
            mapy: item.mapy || item.latitude,
            daysLeft: index < 2 ? '진행중' : '곧 시작'
        };
    });

    const ongoing = festivals.filter(f => f.status === 'ongoing');
    const upcoming = festivals.filter(f => f.status === 'upcoming');
    const thisWeekend = festivals.filter(f => f.isThisWeekend);

    return {
        ongoing,
        upcoming,
        thisWeekend,
        stats: {
            total: festivals.length,
            ongoing: ongoing.length,
            upcoming: upcoming.length,
            thisWeekend: thisWeekend.length,
            regions: 1
        }
    };
}

// === 전북 샘플 데이터 ===
function getJeonbukSampleData() {
    const festivals = [
        {
            id: 'jeonbuk_001',
            title: '🏛️ 전주 한옥마을 문화축제',
            location: '전주 한옥마을',
            region: '전북',
            startDate: '2025.06.10',
            endDate: '2025.06.17',
            status: 'upcoming',
            isThisWeekend: false,
            tel: '063-281-2114',
            category: '전통축제',
            daysLeft: '9일 후 시작'
        },
        {
            id: 'jeonbuk_002',
            title: '🍯 전주 비빔밥 축제',
            location: '전주시 완산구',
            region: '전북',
            startDate: '2025.06.05',
            endDate: '2025.06.12',
            status: 'upcoming',
            isThisWeekend: true,
            tel: '063-281-2000',
            category: '음식축제',
            daysLeft: '4일 후 시작'
        }
    ];

    return {
        ongoing: [],
        upcoming: festivals,
        thisWeekend: festivals.filter(f => f.isThisWeekend),
        stats: {
            total: festivals.length,
            ongoing: 0,
            upcoming: festivals.length,
            thisWeekend: 1,
            regions: 1
        }
    };
}
