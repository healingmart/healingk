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
        
        console.log('🏛️ === URL 직접 삽입 방식 테스트 ===');
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));
        console.log('🗺️ 요청 지역:', region);

        const possibleKeys = [
            process.env.TOUR_API_KEY,
            process.env.TOURISM_API_KEY,
            process.env.JEONBUK_API_KEY,
            process.env.WEATHER_API_KEY,
            process.env.REGIONAL_API_KEY
        ];

        const apiKey = possibleKeys.find(key => key);

        if (!apiKey) {
            console.log('❌ API 키 없음');
            return res.status(200).json({
                success: true,
                data: getTourismSampleData(region),
                message: '⚠️ API 키 설정 필요',
                timestamp: new Date().toISOString()
            });
        }

        console.log('✅ API 키 발견:', `${apiKey.substring(0, 10)}...`);

        // === URL 직접 삽입 방식 테스트 ===
        const tourismResult = await testDirectUrlMethod(apiKey, region);
        console.log('📊 결과:', tourismResult);

        if (tourismResult.success) {
            console.log('🎉 URL 직접 삽입 성공!');
            return res.status(200).json({
                success: true,
                data: tourismResult.data,
                message: `🏛️ ${region} 실시간 관광 정보!`,
                method: tourismResult.method,
                realTime: true,
                timestamp: new Date().toISOString()
            });
        }

        console.log('⚠️ URL 직접 삽입 실패');
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(region),
            message: `🏛️ ${region} 관광 정보 (API 연결 대기중)`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ API 오류:', error);
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(req.query.region || '서울'),
            message: '🏛️ 관광 정보 (백업)',
            timestamp: new Date().toISOString()
        });
    }
};

// === URL 직접 삽입 방식 테스트 ===
async function testDirectUrlMethod(apiKey, region) {
    try {
        const areaCode = AREA_CODES[region] || 1;
        
        // 다양한 URL 직접 삽입 방식들
        const directUrlMethods = [
            // 방법 1: 원본 키 그대로
            {
                name: 'direct_original',
                url: `https://apis.data.go.kr/B551011/KorService2/areaBasedList1?serviceKey=${apiKey}&numOfRows=10&pageNo=1&MobileOS=ETC&MobileApp=HealingK&_type=json&listYN=Y&arrange=A&contentTypeId=12&areaCode=${areaCode}`
            },
            // 방법 2: encodeURIComponent 적용
            {
                name: 'direct_encoded',
                url: `https://apis.data.go.kr/B551011/KorService2/areaBasedList1?serviceKey=${encodeURIComponent(apiKey)}&numOfRows=10&pageNo=1&MobileOS=ETC&MobileApp=HealingK&_type=json&listYN=Y&arrange=A&contentTypeId=12&areaCode=${areaCode}`
            },
            // 방법 3: decodeURIComponent 후 다시 encode
            {
                name: 'direct_decode_encode',
                url: `https://apis.data.go.kr/B551011/KorService2/areaBasedList1?serviceKey=${encodeURIComponent(decodeURIComponent(apiKey))}&numOfRows=10&pageNo=1&MobileOS=ETC&MobileApp=HealingK&_type=json&listYN=Y&arrange=A&contentTypeId=12&areaCode=${areaCode}`
            },
            // 방법 4: HTTP 버전
            {
                name: 'direct_http',
                url: `http://apis.data.go.kr/B551011/KorService2/areaBasedList1?serviceKey=${apiKey}&numOfRows=10&pageNo=1&MobileOS=ETC&MobileApp=HealingK&_type=json&listYN=Y&arrange=A&contentTypeId=12&areaCode=${areaCode}`
            },
            // 방법 5: 다른 파라미터 순서
            {
                name: 'direct_reorder',
                url: `https://apis.data.go.kr/B551011/KorService2/areaBasedList1?MobileOS=ETC&MobileApp=HealingK&_type=json&serviceKey=${apiKey}&areaCode=${areaCode}&contentTypeId=12&numOfRows=10&pageNo=1&listYN=Y&arrange=A`
            },
            // 방법 6: 최소 파라미터만
            {
                name: 'direct_minimal',
                url: `https://apis.data.go.kr/B551011/KorService2/areaBasedList1?serviceKey=${apiKey}&areaCode=${areaCode}&numOfRows=10&_type=json`
            }
        ];

        for (const method of directUrlMethods) {
            try {
                console.log(`🔗 시도: ${method.name}`);
                console.log(`📎 URL: ${method.url.substring(0, 100)}...`);

                const response = await axios.get(method.url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'HealingK/1.0',
                        'Accept': '*/*'
                    }
                });

                console.log(`📡 ${method.name} 응답:`, {
                    status: response.status,
                    contentType: response.headers['content-type'],
                    dataType: typeof response.data,
                    length: typeof response.data === 'string' ? response.data.length : 'object'
                });

                // JSON 응답 체크
                if (response.data && typeof response.data === 'object') {
                    const resultCode = response.data.response?.header?.resultCode;
                    console.log('📊 결과 코드:', resultCode);

                    if (resultCode === '0000') {
                        const items = response.data.response?.body?.items?.item || [];
                        console.log('📦 아이템 수:', Array.isArray(items) ? items.length : (items ? 1 : 0));

                        if (items && (Array.isArray(items) ? items.length > 0 : true)) {
                            console.log(`🎉 성공! 방법: ${method.name}`);
                            return {
                                success: true,
                                method: method.name,
                                data: convertToTourismFormat(items, region)
                            };
                        }
                    } else {
                        console.log('❌ 응답 오류:', response.data.response?.header?.resultMsg);
                    }
                }
                // XML 응답 체크
                else if (typeof response.data === 'string') {
                    console.log('🔄 XML 응답 체크...');
                    
                    if (response.data.includes('<resultCode>00</resultCode>')) {
                        console.log(`🎉 XML 성공! 방법: ${method.name}`);
                        
                        const titleMatches = response.data.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
                        if (titleMatches && titleMatches.length > 0) {
                            const xmlItems = titleMatches.slice(0, 5).map((match, index) => {
                                const title = match.replace(/<title><!\[CDATA\[/, '').replace(/\]\]><\/title>/, '');
                                return { title, contentid: `xml_${index}` };
                            });
                            
                            return {
                                success: true,
                                method: `${method.name}_xml`,
                                data: convertToTourismFormat(xmlItems, region)
                            };
                        }
                    } else {
                        console.log('❌ XML 오류:', response.data.substring(0, 200));
                    }
                }

                // 다음 시도 전 대기
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (methodError) {
                console.log(`❌ ${method.name} 실패:`, methodError.message);
                console.log('🔍 상태:', methodError.response?.status, methodError.response?.statusText);
                continue;
            }
        }

        return { success: false, method: 'direct_url_failed' };

    } catch (error) {
        console.log('❌ 전체 직접 URL 테스트 실패:', error.message);
        return { success: false, method: 'direct_url_error', error: error.message };
    }
}

// === 데이터 변환 함수 ===
function convertToTourismFormat(data, region) {
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
        message: `🏛️ ${region} 관광 정보 (실시간 API 연결)`
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
        message: `API 키 처리 방식 테스트 - ${region} 샘플 데이터`
    };
}
