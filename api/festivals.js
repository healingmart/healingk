// 더 간단한 테스트로 정확한 원인 파악
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
        
        console.log('🔑 API 키 정보:', {
            exists: !!apiKey,
            length: apiKey ? apiKey.length : 0,
            type: typeof apiKey
        });

        if (!apiKey) {
            return res.status(200).json({
                success: true,
                data: getSampleFestivalsWithStats(),
                message: '⚠️ API 키 없음'
            });
        }

        // === 가장 간단한 직접 테스트 ===
        console.log('🧪 직접 API 테스트 시작...');
        
        try {
            const directTest = await axios.get('http://apis.data.go.kr/B551011/KorService1/searchFestival1', {
                params: {
                    serviceKey: apiKey, // 인코딩 없이 직접
                    numOfRows: 1,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    listYN: 'Y',
                    eventStartDate: '20250601',
                    eventEndDate: '20250630',
                    areaCode: 1
                },
                timeout: 15000,
                headers: {
                    'User-Agent': 'HealingK/1.0'
                }
            });

            console.log('📡 직접 테스트 성공:', {
                status: directTest.status,
                statusText: directTest.statusText,
                headers: directTest.headers,
                dataType: typeof directTest.data,
                dataKeys: directTest.data ? Object.keys(directTest.data) : 'no data'
            });

            // 전체 응답을 로그로 확인
            console.log('📋 전체 응답 데이터:', JSON.stringify(directTest.data, null, 2));

            // 응답 분석
            if (directTest.data) {
                console.log('✅ 응답 구조 분석:', {
                    hasResponse: !!directTest.data.response,
                    hasHeader: !!directTest.data.response?.header,
                    hasBody: !!directTest.data.response?.body,
                    resultCode: directTest.data.response?.header?.resultCode,
                    resultMsg: directTest.data.response?.header?.resultMsg
                });
            }

        } catch (axiosError) {
            console.log('❌ Axios 오류 상세:', {
                name: axiosError.name,
                message: axiosError.message,
                code: axiosError.code,
                status: axiosError.response?.status,
                statusText: axiosError.response?.statusText,
                responseData: axiosError.response?.data,
                requestURL: axiosError.config?.url,
                requestParams: axiosError.config?.params
            });

            // 네트워크 오류별 처리
            if (axiosError.code === 'ENOTFOUND') {
                console.log('🌐 DNS 해결 실패 - API 서버 주소 문제');
            } else if (axiosError.code === 'ECONNABORTED') {
                console.log('⏱️ 요청 타임아웃');
            } else if (axiosError.code === 'ECONNREFUSED') {
                console.log('🚫 연결 거부됨');
            }
        }

        // === 대안 API URL 테스트 ===
        console.log('🔄 대안 URL 테스트...');
        
        try {
            const alternativeTest = await axios.get('https://apis.data.go.kr/B551011/KorService1/searchFestival1', {
                params: {
                    serviceKey: encodeURIComponent(apiKey),
                    numOfRows: 1,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    listYN: 'Y',
                    eventStartDate: '20250601',
                    eventEndDate: '20250630',
                    areaCode: 1
                },
                timeout: 15000
            });

            console.log('✅ HTTPS URL 성공:', alternativeTest.status);
            console.log('📋 HTTPS 응답:', JSON.stringify(alternativeTest.data, null, 2));

        } catch (httpsError) {
            console.log('❌ HTTPS URL도 실패:', httpsError.message);
        }

        // === 실제 동작하는 샘플 데이터 반환 ===
        return res.status(200).json({
            success: true,
            data: getSampleFestivalsWithStats(),
            message: '🔍 API 테스트 완료 - 로그 확인 후 샘플 데이터',
            timestamp: new Date().toISOString(),
            debug: 'API 연결 테스트 진행됨'
        });

    } catch (error) {
        console.error('❌ 전체 함수 오류:', error);
        return res.status(200).json({
            success: true,
            data: getSampleFestivalsWithStats(),
            message: `⚠️ 함수 오류: ${error.message}`,
            timestamp: new Date().toISOString()
        });
    }
};

// 고품질 샘플 데이터
function getSampleFestivalsWithStats() {
    const sampleFestivals = [
        {
            id: 'sample1',
            title: '🎪 서울 한강 여름축제 2025',
            location: '한강공원 여의도구간',
            region: '서울',
            startDate: '2025.06.01',
            endDate: '2025.06.30',
            status: 'ongoing',
            isThisWeekend: true,
            tel: '02-3780-0561',
            daysLeft: '29일 남음',
            category: '야외축제',
            mapx: '126.9312',
            mapy: '37.5292'
        },
        {
            id: 'sample2',
            title: '🌊 부산 바다축제 2025',
            location: '해운대 해수욕장',
            region: '부산',
            startDate: '2025.06.15',
            endDate: '2025.06.25',
            status: 'upcoming',
            isThisWeekend: false,
            tel: '051-749-4000',
            daysLeft: '14일 후 시작',
            category: '해양축제',
            mapx: '129.1603',
            mapy: '35.1587'
        },
        {
            id: 'sample3',
            title: '🌸 제주 유채꽃 축제',
            location: '제주 성산일출봉 일대',
            region: '제주',
            startDate: '2025.06.07',
            endDate: '2025.06.14',
            status: 'upcoming',
            isThisWeekend: true,
            tel: '064-740-6000',
            daysLeft: '6일 후 시작',
            category: '자연축제',
            mapx: '126.942',
            mapy: '33.460'
        },
        {
            id: 'sample4',
            title: '☕ 강릉 커피축제 2025',
            location: '강릉 안목해변',
            region: '강원',
            startDate: '2025.06.20',
            endDate: '2025.06.22',
            status: 'upcoming',
            isThisWeekend: false,
            tel: '033-640-5420',
            daysLeft: '19일 후 시작',
            category: '음식축제'
        },
        {
            id: 'sample5',
            title: '🏛️ 전주 한옥마을 문화축제',
            location: '전주 한옥마을',
            region: '전북',
            startDate: '2025.06.10',
            endDate: '2025.06.17',
            status: 'upcoming',
            isThisWeekend: false,
            tel: '063-281-2114',
            daysLeft: '9일 후 시작',
            category: '전통축제'
        },
        {
            id: 'sample6',
            title: '🎨 대구 컬러풀 축제',
            location: '대구 김광석길',
            region: '대구',
            startDate: '2025.06.08',
            endDate: '2025.06.16',
            status: 'upcoming',
            isThisWeekend: true,
            tel: '053-661-2000',
            daysLeft: '7일 후 시작',
            category: '문화축제'
        }
    ];

    const ongoing = sampleFestivals.filter(f => f.status === 'ongoing');
    const upcoming = sampleFestivals.filter(f => f.status === 'upcoming');
    const thisWeekend = sampleFestivals.filter(f => f.isThisWeekend);

    return {
        ongoing,
        upcoming,
        thisWeekend,
        stats: {
            total: sampleFestivals.length,
            ongoing: ongoing.length,
            upcoming: upcoming.length,
            thisWeekend: thisWeekend.length,
            regions: [...new Set(sampleFestivals.map(f => f.region))].length
        }
    };
}
