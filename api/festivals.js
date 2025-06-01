const axios = require('axios');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const apiKey = process.env.TOURISM_API_KEY;
        
        console.log('🔍 === 정확한 문제 진단 시작 ===');
        console.log('🔑 환경변수 체크:', {
            키존재: !!apiKey,
            키길이: apiKey?.length,
            키시작: apiKey?.substring(0, 20),
            키끝: apiKey?.substring(apiKey?.length - 20)
        });

        if (!apiKey) {
            return res.status(200).json({
                success: true,
                data: getBackupData(),
                message: '❌ API 키 없음'
            });
        }

        // === 진단 1: 다른 관광 API 테스트 ===
        console.log('🧪 진단 1: 일반 관광지 API 테스트...');
        const tourismResult = await testGeneralTourism(apiKey);
        console.log('📊 일반 관광지 결과:', tourismResult);

        // === 진단 2: 축제 API 원시 테스트 ===
        console.log('🧪 진단 2: 축제 API 원시 테스트...');
        const festivalRawResult = await testFestivalRaw(apiKey);
        console.log('📊 축제 원시 결과:', festivalRawResult);

        // === 진단 3: 키 인코딩 테스트 ===
        console.log('🧪 진단 3: 다양한 인코딩 테스트...');
        const encodingResults = await testDifferentEncodings(apiKey);
        console.log('📊 인코딩 결과:', encodingResults);

        // 결과 분석 및 응답
        const diagnosis = analyzeDiagnosis(tourismResult, festivalRawResult, encodingResults);
        
        return res.status(200).json({
            success: true,
            data: getBackupData(),
            message: '🔍 진단 완료 - 로그 확인',
            diagnosis: diagnosis,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 진단 중 오류:', error);
        return res.status(200).json({
            success: true,
            data: getBackupData(),
            message: '❌ 진단 오류',
            timestamp: new Date().toISOString()
        });
    }
};

// === 진단 1: 일반 관광지 API ===
async function testGeneralTourism(apiKey) {
    try {
        const response = await axios.get('http://apis.data.go.kr/B551011/KorService1/areaBasedList1', {
            params: {
                serviceKey: apiKey,
                numOfRows: 5,
                pageNo: 1,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                listYN: 'Y',
                arrange: 'A',
                contentTypeId: 12, // 관광지
                areaCode: 1 // 서울
            },
            timeout: 10000
        });

        return {
            success: response.data && typeof response.data === 'object',
            status: response.status,
            contentType: response.headers['content-type'],
            isJSON: response.headers['content-type']?.includes('json'),
            resultCode: response.data?.response?.header?.resultCode,
            resultMsg: response.data?.response?.header?.resultMsg,
            hasItems: !!(response.data?.response?.body?.items?.item)
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            code: error.code
        };
    }
}

// === 진단 2: 축제 API 원시 테스트 ===
async function testFestivalRaw(apiKey) {
    try {
        const response = await axios.get('http://apis.data.go.kr/B551011/KorService1/searchFestival1', {
            params: {
                serviceKey: apiKey,
                numOfRows: 5,
                pageNo: 1,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                listYN: 'Y'
                // 최소 파라미터만
            },
            timeout: 10000
        });

        const isXML = typeof response.data === 'string';
        let xmlError = null;
        
        if (isXML) {
            xmlError = {
                hasRegistrationError: response.data.includes('SERVICE_KEY_IS_NOT_REGISTERED_ERROR'),
                hasAccessDeniedError: response.data.includes('SERVICE_ACCESS_DENIED_ERROR'),
                hasServiceError: response.data.includes('SERVICE ERROR'),
                content: response.data.substring(0, 200)
            };
        }

        return {
            success: !isXML && response.data && typeof response.data === 'object',
            status: response.status,
            contentType: response.headers['content-type'],
            isXML: isXML,
            xmlError: xmlError,
            resultCode: isXML ? null : response.data?.response?.header?.resultCode,
            resultMsg: isXML ? null : response.data?.response?.header?.resultMsg
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            code: error.code
        };
    }
}

// === 진단 3: 다양한 인코딩 테스트 ===
async function testDifferentEncodings(apiKey) {
    const encodings = [
        { name: 'raw', key: apiKey },
        { name: 'encodeURIComponent', key: encodeURIComponent(apiKey) },
        { name: 'encodeURI', key: encodeURI(apiKey) }
    ];

    const results = [];

    for (const encoding of encodings) {
        try {
            console.log(`🔧 ${encoding.name} 인코딩 테스트...`);
            
            const response = await axios.get('http://apis.data.go.kr/B551011/KorService1/searchFestival1', {
                params: {
                    serviceKey: encoding.key,
                    numOfRows: 1,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json'
                },
                timeout: 8000
            });

            const isJSON = response.data && typeof response.data === 'object';
            
            results.push({
                encoding: encoding.name,
                success: isJSON,
                status: response.status,
                isJSON: isJSON,
                resultCode: isJSON ? response.data?.response?.header?.resultCode : null
            });

        } catch (error) {
            results.push({
                encoding: encoding.name,
                success: false,
                error: error.message
            });
        }

        // 요청 간 간격
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
}

// === 결과 분석 ===
function analyzeDiagnosis(tourism, festival, encodings) {
    const analysis = {
        generalTourismWorks: tourism.success,
        festivalAPIWorks: festival.success,
        bestEncoding: encodings.find(e => e.success)?.encoding || 'none',
        recommendation: ''
    };

    if (tourism.success && !festival.success) {
        analysis.recommendation = '일반 관광지 API는 되지만 축제 API는 안됨 - 축제 API 별도 승인 필요할 수 있음';
    } else if (!tourism.success && !festival.success) {
        analysis.recommendation = '모든 API 안됨 - API 키나 계정 문제 가능성';
    } else if (festival.success) {
        analysis.recommendation = '축제 API 정상 작동 - 파라미터 문제였을 가능성';
    } else {
        analysis.recommendation = '추가 조사 필요';
    }

    return analysis;
}

function getBackupData() {
    return {
        ongoing: [
            {
                id: '001',
                title: '🎪 서울 한강 여름축제 2025',
                location: '한강공원 여의도구간',
                region: '서울',
                startDate: '2025.06.01',
                endDate: '2025.06.30',
                status: 'ongoing',
                isThisWeekend: true,
                tel: '02-3780-0561',
                daysLeft: '29일 남음',
                category: '야외축제'
            }
        ],
        upcoming: [],
        thisWeekend: [],
        stats: { total: 1, ongoing: 1, upcoming: 0, thisWeekend: 0, regions: 1 }
    };
}
