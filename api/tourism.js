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
        
        console.log('⚡ === fetch 방식 관광 API 테스트 ===');
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));
        console.log('🗺️ 요청 지역:', region);

        // 전북 API와 동일한 환경변수 우선순위
        const possibleKeys = [
            process.env.JEONBUK_API_KEY,
            process.env.TOURISM_API_KEY,
            process.env.TOUR_API_KEY,
            process.env.WEATHER_API_KEY,
            process.env.REGIONAL_API_KEY
        ];

        console.log('🔑 환경변수 체크 (fetch):', {
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
                message: '⚠️ fetch 방식 API 키 설정 필요',
                timestamp: new Date().toISOString()
            });
        }

        console.log('✅ API 키 발견 (fetch):', `${apiKey.substring(0, 10)}...`);

        // 전주/전북 요청은 전북 API로 리다이렉트
        if (region === '전주' || region === '전북') {
            console.log('🔄 전북 API로 리다이렉트 (fetch)...');
            const jeonbukResult = await callJeonbukAPIWithFetch(region);
            if (jeonbukResult.success) {
                return res.status(200).json(jeonbukResult);
            }
        }

        // === fetch로 관광 API 테스트 ===
        console.log('🧪 fetch로 관광 API 테스트...');
        const tourismResult = await testTourismWithFetch(apiKey, region);
        console.log('📊 fetch 결과:', tourismResult);

        if (tourismResult.success) {
            console.log('🎉 fetch 방식 성공!');
            return res.status(200).json({
                success: true,
                data: tourismResult.data,
                message: `🏛️ ${region} 실시간 관광 정보! (fetch)`,
                method: tourismResult.method,
                realTime: true,
                timestamp: new Date().toISOString()
            });
        }

        console.log('⚠️ fetch 방식 실패 - 샘플 데이터 제공');
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(region),
            message: `🏛️ ${region} 관광 정보 (fetch 방식 테스트 중)`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ fetch 방식 오류:', error);
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(req.query.region || '서울'),
            message: '🏛️ 관광 정보 (백업)',
            timestamp: new Date().toISOString()
        });
    }
};

// === fetch로 전북 API 호출 ===
async function callJeonbukAPIWithFetch(region) {
    try {
        console.log('📞 fetch로 전북 API 호출...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(`https://healingk.vercel.app/api/jeonbuk-tourism?region=${region}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'HealingK-Fetch/1.0'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const data = await response.json();
            if (data && data.success) {
                console.log('✅ fetch 전북 API 호출 성공');
                return data;
            }
        }
        
        return { success: false };
    } catch (error) {
        console.log('❌ fetch 전북 API 호출 실패:', error.message);
        return { success: false };
    }
}

// === fetch로 관광 API 테스트 ===
async function testTourismWithFetch(apiKey, region) {
    try {
        const areaCode = AREA_CODES[region] || 1;
        
        // 다양한 API URL들 시도
        const testAPIs = [
            // Service1 방식
            {
                name: 'service1_area',
                url: 'https://apis.data.go.kr/B551011/KorService1/areaBasedList1',
                params: {
                    serviceKey: apiKey,
                    numOfRows: 5,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    listYN: 'Y',
                    arrange: 'A',
                    contentTypeId: 12,
                    areaCode: areaCode
                }
            },
            // Service1 키워드 방식
            {
                name: 'service1_keyword',
                url: 'https://apis.data.go.kr/B551011/KorService1/searchKeyword1',
                params: {
                    serviceKey: apiKey,
                    numOfRows: 5,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    listYN: 'Y',
                    arrange: 'A',
                    keyword: region,
                    contentTypeId: 12
                }
            },
            // Service2 방식
            {
                name: 'service2_area',
                url: 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2',
                params: {
                    serviceKey: apiKey,
                    numOfRows: 5,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    contentTypeId: 12,
                    areaCode: areaCode
                }
            },
            // Service2 키워드 방식
            {
                name: 'service2_keyword',
                url: 'https://apis.data.go.kr/B551011/KorService2/searchKeyword2',
                params: {
                    serviceKey: apiKey,
                    numOfRows: 5,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    keyword: region
                }
            }
        ];

        for (const api of testAPIs) {
            try {
                console.log(`🔍 fetch로 ${api.name} 시도...`);
                
                // URLSearchParams로 쿼리 생성
                const params = new URLSearchParams(api.params);
                const fullUrl = `${api.url}?${params.toString()}`;
                
                console.log(`📎 URL: ${fullUrl.substring(0, 100)}...`);

                // fetch 요청
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                const response = await fetch(fullUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'HealingK-Fetch/1.0'
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                console.log(`📡 ${api.name} 응답:`, {
                    status: response.status,
                    ok: response.ok,
                    contentType: response.headers.get('content-type'),
                    statusText: response.statusText
                });

                if (response.ok) {
                    const contentType = response.headers.get('content-type') || '';
                    
                    if (contentType.includes('application/json')) {
                        // JSON 응답 처리
                        const data = await response.json();
                        console.log(`📦 ${api.name} JSON 응답:`, JSON.stringify(data, null, 2));
                        
                        // 성공 코드 확인
                        const resultCode = data.response?.header?.resultCode || 
                                         data.resultCode || 
                                         data.code;
                        
                        console.log(`📊 ${api.name} 결과 코드:`, resultCode);
                        
                        if (resultCode === '0000' || resultCode === '00' || resultCode === '0') {
                            const items = data.response?.body?.items?.item || 
                                         data.items || 
                                         data.data || 
                                         data.result;
                            
                            if (items && (Array.isArray(items) ? items.length > 0 : true)) {
                                console.log(`🎉 ${api.name} 데이터 발견!`);
                                return {
                                    success: true,
                                    method: `fetch_${api.name}`,
                                    data: convertToTourismFormat(items, region)
                                };
                            }
                        } else {
                            console.log(`❌ ${api.name} 오류:`, data.response?.header?.resultMsg || data.resultMsg);
                        }
                    } else {
                        // XML 응답 처리
                        const text = await response.text();
                        console.log(`📄 ${api.name} XML 응답:`, text.substring(0, 300));
                        
                        if (text.includes('<resultCode>00</resultCode>')) {
                            console.log(`🎉 ${api.name} XML 성공!`);
                            
                            const titleMatches = text.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
                            if (titleMatches && titleMatches.length > 0) {
                                const xmlItems = titleMatches.slice(0, 3).map((match, index) => {
                                    const title = match.replace(/<title><!\[CDATA\[/, '').replace(/\]\]><\/title>/, '');
                                    return { title, contentid: `xml_${index}` };
                                });
                                
                                return {
                                    success: true,
                                    method: `fetch_${api.name}_xml`,
                                    data: convertToTourismFormat(xmlItems, region)
                                };
                            }
                        }
                    }
                }

                // 다음 API 시도 전 대기
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (apiError) {
                console.log(`❌ ${api.name} fetch 실패:`, apiError.message);
                continue;
            }
        }

        return { success: false, method: 'fetch_all_failed' };

    } catch (error) {
        console.log('❌ fetch 테스트 전체 오류:', error.message);
        return { success: false, method: 'fetch_error', error: error.message };
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
        message: `🏛️ ${region} 관광 정보 (fetch 성공!)`
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
        message: `fetch 방식 테스트 중 - ${region} 샘플 데이터`
    };
}
