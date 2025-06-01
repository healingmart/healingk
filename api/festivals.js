const axios = require('axios');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { region = 'all', status = 'all' } = req.query;
        const apiKey = process.env.TOURISM_API_KEY;

        console.log('🎪 축제 API 요청 시작:', { region, status });
        console.log('🔑 API 키 상태:', { 
            exists: !!apiKey, 
            length: apiKey ? apiKey.length : 0,
            prefix: apiKey ? apiKey.substring(0, 8) + '...' : 'N/A'
        });

        if (!apiKey) {
            console.log('❌ API 키 없음 - 샘플 데이터 반환');
            return res.status(200).json({
                success: true,
                data: getSampleFestivalsWithStats(),
                message: '⚠️ API 키 설정 필요 - 샘플 데이터',
                timestamp: new Date().toISOString()
            });
        }

        // === 단순한 API 테스트부터 시작 ===
        console.log('🧪 API 상태 테스트 시작...');
        
        const testResult = await testApiConnection(apiKey);
        if (!testResult.success) {
            console.log('❌ API 연결 실패:', testResult.error);
            return res.status(200).json({
                success: true,
                data: getSampleFestivalsWithStats(),
                message: `⚠️ API 연결 오류: ${testResult.error} - 샘플 데이터`,
                apiError: testResult.error,
                timestamp: new Date().toISOString()
            });
        }

        console.log('✅ API 연결 성공! 실제 데이터 조회 시작...');

        // === 실제 축제 데이터 조회 (보수적으로) ===
        const festivalData = await fetchFestivalDataSafe(apiKey);
        
        if (festivalData && festivalData.stats.total > 0) {
            console.log('🎉 실제 축제 데이터 성공:', festivalData.stats);
            return res.status(200).json({
                success: true,
                data: festivalData,
                message: '🎪 실시간 축제 정보',
                timestamp: new Date().toISOString()
            });
        } else {
            console.log('⚠️ 실제 데이터 0개 - 고품질 샘플 데이터 제공');
            return res.status(200).json({
                success: true,
                data: getSampleFestivalsWithStats(),
                message: '⚠️ 현재 등록된 축제 없음 - 샘플 데이터',
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('❌ 서버리스 함수 오류:', error);
        return res.status(200).json({
            success: true,
            data: getSampleFestivalsWithStats(),
            message: `⚠️ 서버 오류 - 샘플 데이터: ${error.message}`,
            error: true,
            timestamp: new Date().toISOString()
        });
    }
};

// === API 연결 테스트 함수 ===
async function testApiConnection(apiKey) {
    try {
        console.log('🔍 기본 API 연결 테스트...');
        
        const today = new Date();
        const todayStr = formatDateRaw(today);
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextMonthStr = formatDateRaw(nextMonth);

        const testResponse = await axios.get('http://apis.data.go.kr/B551011/KorService1/searchFestival1', {
            params: {
                serviceKey: encodeURIComponent(apiKey),
                numOfRows: 1, // 최소한만 요청
                pageNo: 1,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                listYN: 'Y',
                arrange: 'A',
                eventStartDate: todayStr,
                eventEndDate: nextMonthStr,
                areaCode: 1 // 서울만 테스트
            },
            timeout: 10000
        });

        console.log('📡 API 테스트 응답:', {
            status: testResponse.status,
            resultCode: testResponse.data?.response?.header?.resultCode,
            resultMsg: testResponse.data?.response?.header?.resultMsg,
            hasBody: !!testResponse.data?.response?.body
        });

        // 전체 응답 구조 로깅 (디버깅용)
        console.log('📋 전체 응답 구조:', JSON.stringify(testResponse.data, null, 2));

        const resultCode = testResponse.data?.response?.header?.resultCode;
        const resultMsg = testResponse.data?.response?.header?.resultMsg;

        if (resultCode === '0000') {
            return { success: true, message: 'API 연결 성공' };
        } else {
            const errorMessages = {
                '01': 'API 서비스 키 오류',
                '02': '요청 파라미터 오류', 
                '03': 'NoData',
                '04': 'HTTP 오류',
                '05': 'API 서비스 오류',
                '99': 'API 일일 호출 한도 초과',
                '10': '잘못된 요청 파라미터',
                '11': '필수 요청 파라미터 없음'
            };
            
            const errorDetail = errorMessages[resultCode] || `알 수 없는 오류 (${resultCode})`;
            return { 
                success: false, 
                error: `${errorDetail}: ${resultMsg || 'N/A'}`,
                code: resultCode 
            };
        }

    } catch (error) {
        console.log('❌ API 테스트 실패:', {
            name: error.name,
            message: error.message,
            code: error.code,
            response: error.response?.data
        });
        
        return { 
            success: false, 
            error: `네트워크 오류: ${error.message}` 
        };
    }
}

// === 안전한 축제 데이터 조회 ===
async function fetchFestivalDataSafe(apiKey) {
    try {
        console.log('📡 축제 데이터 조회 시작...');
        
        const today = new Date();
        const todayStr = formatDateRaw(today);
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 2);
        const nextMonthStr = formatDateRaw(nextMonth);

        console.log('📅 검색 날짜:', { todayStr, nextMonthStr });

        // === 서울만 먼저 테스트 ===
        const response = await axios.get('http://apis.data.go.kr/B551011/KorService1/searchFestival1', {
            params: {
                serviceKey: encodeURIComponent(apiKey),
                numOfRows: 50,
                pageNo: 1,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                listYN: 'Y',
                arrange: 'A',
                eventStartDate: todayStr,
                eventEndDate: nextMonthStr,
                areaCode: 1 // 서울만
            },
            timeout: 15000
        });

        console.log('📊 서울 축제 API 응답:', {
            status: response.status,
            resultCode: response.data?.response?.header?.resultCode,
            resultMsg: response.data?.response?.header?.resultMsg
        });

        if (response.data?.response?.header?.resultCode === '0000') {
            const items = response.data.response.body?.items?.item || [];
            const itemsArray = Array.isArray(items) ? items : (items ? [items] : []);
            
            console.log(`✅ 서울 축제 ${itemsArray.length}개 발견`);

            if (itemsArray.length > 0) {
                // 간단하게 처리
                const processedFestivals = itemsArray.map(festival => ({
                    id: festival.contentid,
                    title: festival.title || '축제명 없음',
                    location: festival.addr1 || festival.eventplace || '장소 미정',
                    region: '서울',
                    startDate: formatDateDisplay(festival.eventstartdate),
                    endDate: formatDateDisplay(festival.eventenddate),
                    startDateRaw: festival.eventstartdate,
                    endDateRaw: festival.eventenddate,
                    status: determineStatus(festival.eventstartdate, festival.eventenddate, todayStr),
                    isThisWeekend: checkThisWeekend(festival.eventstartdate, festival.eventenddate, todayStr),
                    tel: festival.tel || '',
                    category: festival.cat3 || festival.cat2 || '축제',
                    mapx: festival.mapx,
                    mapy: festival.mapy,
                    daysLeft: calculateDaysLeft(festival.eventstartdate, festival.eventenddate, todayStr)
                }));

                const ongoing = processedFestivals.filter(f => f.status === 'ongoing');
                const upcoming = processedFestivals.filter(f => f.status === 'upcoming');
                const thisWeekend = processedFestivals.filter(f => f.isThisWeekend);

                return {
                    ongoing,
                    upcoming,
                    thisWeekend,
                    stats: {
                        total: processedFestivals.length,
                        ongoing: ongoing.length,
                        upcoming: upcoming.length,
                        thisWeekend: thisWeekend.length,
                        regions: 1
                    }
                };
            }
        }

        return null;

    } catch (error) {
        console.log('❌ 축제 데이터 조회 실패:', error.message);
        return null;
    }
}

// === 헬퍼 함수들 ===
function determineStatus(startDateRaw, endDateRaw, todayStr) {
    if (!startDateRaw || !endDateRaw) return 'upcoming';
    
    if (startDateRaw <= todayStr && endDateRaw >= todayStr) {
        return 'ongoing';
    } else if (endDateRaw < todayStr) {
        return 'ended';
    }
    return 'upcoming';
}

function formatDateDisplay(dateStr) {
    if (!dateStr || dateStr.length !== 8) return '날짜 미정';
    return `${dateStr.slice(0,4)}.${dateStr.slice(4,6)}.${dateStr.slice(6,8)}`;
}

function formatDateRaw(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
}

function calculateDaysLeft(startDateRaw, endDateRaw, todayRaw) {
    if (!startDateRaw || !endDateRaw || !todayRaw) return '날짜 정보 없음';
    
    try {
        const start = new Date(startDateRaw.slice(0,4), startDateRaw.slice(4,6)-1, startDateRaw.slice(6,8));
        const end = new Date(endDateRaw.slice(0,4), endDateRaw.slice(4,6)-1, endDateRaw.slice(6,8));
        const now = new Date(todayRaw.slice(0,4), todayRaw.slice(4,6)-1, todayRaw.slice(6,8));
        
        if (start <= now && end >= now) {
            const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return daysLeft === 0 ? '오늘 종료' : `${daysLeft}일 남음`;
        } else if (start > now) {
            const daysUntil = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return `${daysUntil}일 후 시작`;
        }
        return '종료';
    } catch (error) {
        return '날짜 계산 오류';
    }
}

function checkThisWeekend(startDateRaw, endDateRaw, todayRaw) {
    if (!startDateRaw || !endDateRaw || !todayRaw) return false;
    
    try {
        const startDate = new Date(startDateRaw.slice(0,4), startDateRaw.slice(4,6)-1, startDateRaw.slice(6,8));
        const endDate = new Date(endDateRaw.slice(0,4), endDateRaw.slice(4,6)-1, endDateRaw.slice(6,8));
        const today = new Date(todayRaw.slice(0,4), todayRaw.slice(4,6)-1, todayRaw.slice(6,8));
        
        const thisSaturday = new Date(today);
        const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
        thisSaturday.setDate(today.getDate() + daysUntilSaturday);
        
        const thisSunday = new Date(thisSaturday);
        thisSunday.setDate(thisSaturday.getDate() + 1);
        
        return (startDate <= thisSunday && endDate >= thisSaturday);
    } catch (error) {
        return false;
    }
}

// === 고품질 샘플 데이터 ===
function getSampleFestivalsWithStats() {
    const today = new Date();
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
