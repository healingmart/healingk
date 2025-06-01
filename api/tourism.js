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
        
        console.log('🎉 === KorService2 API 테스트 시작 ===');
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));
        console.log('🗺️ 요청 지역:', region);

        // TOURISM_API_KEY 우선 사용
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

        // === KorService2 테스트 ===
        console.log('🧪 KorService2 API 테스트...');
        const tourismResult = await testKorService2(apiKey, region);
        console.log('📊 결과:', tourismResult);

        if (tourismResult.success) {
            console.log('🎉 KorService2 성공!');
            return res.status(200).json({
                success: true,
                data: tourismResult.data,
                message: `🏛️ ${region} 실시간 관광 정보! (Service2)`,
                method: tourismResult.method,
                realTime: true,
                timestamp: new Date().toISOString()
            });
        }

        console.log('⚠️ KorService2 테스트 실패');
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(region),
            message: `🏛️ ${region} 관광 정보 (Service2 연결 대기중)`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Service2 API 오류:', error);
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(req.query.region || '서울'),
            message: '🏛️ 관광 정보 (백업)',
            timestamp: new Date().toISOString()
        });
    }
};

// === KorService2 테스트 함수 ===
async function testKorService2(apiKey, region) {
    try {
        const areaCode = AREA_CODES[region] || 1;
        
        // KorService2 URL들
        const service2URLs = [
            'https://apis.data.go.kr/B551011/KorService2/areaBasedList2',
            'http://apis.data.go.kr/B551011/KorService2/areaBasedList2',
            'https://apis.data.go.kr/B551011/KorService2/searchKeyword2',
            'http://apis.data.go.kr/B551011/KorService2/searchKeyword2',
            'https://apis.data.go.kr/B551011/KorService2/locationBasedList2',
            'http://apis.data.go.kr/B551011/KorService2/locationBasedList2'
        ];

        for (const url of service2URLs) {
            try {
                console.log(`🔍 Service2 URL 시도: ${url}`);

                let params;
                
                if (url.includes('areaBasedList2')) {
                    params = {
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
                } else if (url.includes('searchKeyword2')) {
                    params = {
                        serviceKey: apiKey,
                        numOfRows: 10,
                        pageNo: 1,
                        MobileOS: 'ETC',
                        MobileApp: 'HealingK',
                        _type: 'json',
                        listYN: 'Y',
                        arrange: 'A',
                        keyword: region,
                        contentTypeId: 12
                    };
                } else if (url.includes('locationBasedList2')) {
                    params = {
                        serviceKey: apiKey,
                        numOfRows: 10,
                        pageNo: 1,
                        MobileOS: 'ETC',
                        MobileApp: 'HealingK',
                        _type: 'json',
                        listYN: 'Y',
                        arrange: 'A',
                        contentTypeId: 12,
                        mapX: areaCode === 1 ? '126.9780' : '129.0756',
                        mapY: areaCode === 1 ? '37.5665' : '35.1796',
                        radius: '20000'
                    };
                }

                console.log('📋 파라미터:', {
                    serviceKey: 'exists',
                    areaCode: params.areaCode || 'N/A',
                    keyword: params.keyword || 'N/A'
                });

                const response = await axios.get(url, {
                    params: params,
                    timeout: 10000
                });

                console.log(`📡 Service2 응답:`, {
                    status: response.status,
                    contentType: response.headers['content-type'],
                    isJSON: response.headers['content-type']?.includes('json'),
                    dataType: typeof response.data
                });

                // JSON 응답 처리
                if (response.data && typeof response.data === 'object') {
                    const resultCode = response.data.response?.header?.resultCode;
                    console.log('📊 결과 코드:', resultCode);

                    if (resultCode === '0000') {
                        const items = response.data.response?.body?.items?.item || [];
                        console.log('📦 아이템 수:', Array.isArray(items) ? items.length : (items ? 1 : 0));

                        if (items && (Array.isArray(items) ? items.length > 0 : true)) {
                            console.log('🎉 Service2 데이터 발견!');
                            return {
                                success: true,
                                method: 'korservice2',
                                data: convertToTourismFormat(items, region)
                            };
                        }
                    } else {
                        console.log('❌ Service2 오류:', response.data.response?.header?.resultMsg);
                    }
                }
                // XML 응답 처리
                else if (typeof response.data === 'string') {
                    console.log('🔄 Service2 XML 응답 확인...');
                    
                    if (response.data.includes('<resultCode>00</resultCode>')) {
                        console.log('🎉 Service2 XML 성공!');
                        
                        const titleMatches = response.data.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
                        if (titleMatches && titleMatches.length > 0) {
                            const xmlItems = titleMatches.slice(0, 5).map((match, index) => {
                                const title = match.replace(/<title><!\[CDATA\[/, '').replace(/\]\]><\/title>/, '');
                                return { title, contentid: `xml_${index}` };
                            });
                            
                            return {
                                success: true,
                                method: 'korservice2_xml',
                                data: convertToTourismFormat(xmlItems, region)
                            };
                        }
                    } else {
                        console.log('❌ Service2 XML 오류:', response.data.substring(0, 200));
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (urlError) {
                console.log(`❌ Service2 URL 실패:`, urlError.message);
                continue;
            }
        }

        return { success: false, method: 'korservice2' };

    } catch (error) {
        return { success: false, method: 'korservice2', error: error.message };
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
        message: `🏛️ ${region} 관광 정보 (KorService2 연결)`
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
        message: `TOURISM_API_KEY 설정 필요 - ${region} 샘플 데이터`
    };
}
