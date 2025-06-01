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
        
        console.log('🎪 승인된 API로 실시간 축제 데이터 조회 시작!');
        console.log('🔑 API 키 정보:', { exists: !!apiKey, length: apiKey?.length });

        if (!apiKey) {
            return res.status(200).json({
                success: true,
                data: getBackupFestivalData(),
                message: '⚠️ API 키 설정 필요'
            });
        }

        // === 승인된 API로 실제 테스트 ===
        console.log('🧪 승인된 API 연결 테스트...');
        
        const testResult = await testApprovedAPI(apiKey);
        
        if (testResult.success) {
            console.log('🎉 실시간 API 연결 성공! 실제 데이터 조회 시작...');
            
            // 실제 축제 데이터 조회
            const realFestivalData = await fetchRealFestivalData(apiKey, region);
            
            if (realFestivalData && realFestivalData.stats.total > 0) {
                console.log('✅ 실시간 축제 데이터 조회 성공:', realFestivalData.stats);
                
                return res.status(200).json({
                    success: true,
                    data: realFestivalData,
                    message: '🎪 실시간 축제 정보 (승인된 API)',
                    realTime: true,
                    apiStatus: 'approved',
                    timestamp: new Date().toISOString()
                });
            }
        }

        // API가 아직 활성화 안됐거나 데이터 없으면 백업 데이터
        console.log('⚠️ 실시간 데이터 없음 - 고품질 백업 데이터 제공');
        return res.status(200).json({
            success: true,
            data: getBackupFestivalData(region),
            message: '🎪 축제 정보 (API 활성화 대기중)',
            realTime: false,
            apiStatus: testResult.success ? 'approved_no_data' : 'activating',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 축제 API 오류:', error);
        return res.status(200).json({
            success: true,
            data: getBackupFestivalData(region),
            message: '🎪 축제 정보 (백업 데이터)',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// === 승인된 API 테스트 ===
async function testApprovedAPI(apiKey) {
    try {
        const today = new Date();
        const todayStr = formatDateRaw(today);
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 2);
        const nextMonthStr = formatDateRaw(nextMonth);

        console.log('📅 검색 기간:', { todayStr, nextMonthStr });

        const response = await axios.get('http://apis.data.go.kr/B551011/KorService1/searchFestival1', {
            params: {
                serviceKey: apiKey, // 인코딩 없이 직접 시도
                numOfRows: 10,
                pageNo: 1,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                listYN: 'Y',
                arrange: 'A',
                eventStartDate: todayStr,
                eventEndDate: nextMonthStr,
                areaCode: 1 // 서울
            },
            timeout: 15000
        });

        console.log('📡 승인된 API 응답:', {
            status: response.status,
            contentType: response.headers['content-type'],
            dataType: typeof response.data
        });

        // XML 응답인 경우 확인
        if (typeof response.data === 'string') {
            console.log('📋 XML 응답 내용:', response.data.slice(0, 500) + '...');
            
            if (response.data.includes('SERVICE_KEY_IS_NOT_REGISTERED_ERROR')) {
                return { success: false, error: 'API 키 아직 활성화 안됨' };
            }
            if (response.data.includes('SERVICE ERROR')) {
                return { success: false, error: 'API 서비스 오류' };
            }
        }

        // JSON 응답인 경우
        if (response.data && typeof response.data === 'object') {
            console.log('📊 JSON 응답 구조:', {
                hasResponse: !!response.data.response,
                resultCode: response.data.response?.header?.resultCode,
                resultMsg: response.data.response?.header?.resultMsg
            });

            if (response.data.response?.header?.resultCode === '0000') {
                return { success: true, data: response.data };
            }
        }

        return { success: false, error: '응답 형식 확인 필요' };

    } catch (error) {
        console.log('❌ API 테스트 실패:', error.message);
        return { success: false, error: error.message };
    }
}

// === 실제 축제 데이터 조회 ===
async function fetchRealFestivalData(apiKey, region) {
    try {
        const today = new Date();
        const todayStr = formatDateRaw(today);
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 3);
        const futureStr = formatDateRaw(futureDate);

        // 지역 코드 매핑
        const areaCodes = region === 'all' ? [1, 6, 39, 32, 37] : [getAreaCode(region) || 1];
        
        let allFestivals = [];

        for (const areaCode of areaCodes) {
            try {
                console.log(`🔍 ${getRegionName(areaCode)} 축제 조회...`);

                const response = await axios.get('http://apis.data.go.kr/B551011/KorService1/searchFestival1', {
                    params: {
                        serviceKey: apiKey,
                        numOfRows: 50,
                        pageNo: 1,
                        MobileOS: 'ETC',
                        MobileApp: 'HealingK',
                        _type: 'json',
                        listYN: 'Y',
                        arrange: 'A',
                        eventStartDate: todayStr,
                        eventEndDate: futureStr,
                        areaCode: areaCode
                    },
                    timeout: 10000
                });

                if (response.data?.response?.header?.resultCode === '0000') {
                    const items = response.data.response.body?.items?.item || [];
                    const itemsArray = Array.isArray(items) ? items : (items ? [items] : []);
                    
                    console.log(`✅ ${getRegionName(areaCode)}: ${itemsArray.length}개 축제`);
                    allFestivals.push(...itemsArray);
                }

                // API 호출 간격
                await new Promise(resolve => setTimeout(resolve, 300));

            } catch (error) {
                console.log(`❌ ${getRegionName(areaCode)} 조회 실패:`, error.message);
                continue;
            }
        }

        if (allFestivals.length === 0) {
            return null;
        }

        // 데이터 가공
        const processedFestivals = allFestivals.map(festival => ({
            id: festival.contentid,
            title: festival.title || '축제명 없음',
            location: festival.addr1 || festival.eventplace || '장소 미정',
            region: getRegionName(parseInt(festival.areacode)),
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
            daysLeft: calculateDaysLeft(festival.eventstartdate, festival.eventenddate, todayStr),
            image: festival.firstimage || festival.firstimage2 || null
        })).filter(f => f.status !== 'ended');

        // 상태별 분류
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
                regions: [...new Set(processedFestivals.map(f => f.region))].length
            }
        };

    } catch (error) {
        console.log('❌ 실제 축제 데이터 조회 실패:', error.message);
        return null;
    }
}

// === 헬퍼 함수들 ===
function getAreaCode(regionName) {
    const codes = {
        '서울': 1, '부산': 6, '제주': 39, '강릉': 32, '전주': 37,
        '대구': 4, '광주': 5, '대전': 3, '인천': 2
    };
    return codes[regionName] || null;
}

function getRegionName(areacode) {
    const regions = {
        1: '서울', 6: '부산', 39: '제주', 32: '강원', 37: '전북',
        4: '대구', 5: '광주', 3: '대전', 2: '인천'
    };
    return regions[areacode] || '기타';
}

function formatDateRaw(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
}

function formatDateDisplay(dateStr) {
    if (!dateStr || dateStr.length !== 8) return '날짜 미정';
    return `${dateStr.slice(0,4)}.${dateStr.slice(4,6)}.${dateStr.slice(6,8)}`;
}

function determineStatus(startDateRaw, endDateRaw, todayStr) {
    if (!startDateRaw || !endDateRaw) return 'upcoming';
    if (startDateRaw <= todayStr && endDateRaw >= todayStr) return 'ongoing';
    if (endDateRaw < todayStr) return 'ended';
    return 'upcoming';
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

// === 백업 데이터 (이전 고품질 샘플 데이터) ===
function getBackupFestivalData(region = 'all') {
    // 이전에 만든 고품질 샘플 데이터 사용
    const sampleFestivals = [
        {
            id: 'backup_001',
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
        // ... 나머지 백업 데이터들
    ];

    // 지역 필터링 로직
    let filteredFestivals = sampleFestivals;
    if (region !== 'all') {
        filteredFestivals = sampleFestivals.filter(f => f.region === region);
    }

    const ongoing = filteredFestivals.filter(f => f.status === 'ongoing');
    const upcoming = filteredFestivals.filter(f => f.status === 'upcoming');
    const thisWeekend = filteredFestivals.filter(f => f.isThisWeekend);

    return {
        ongoing,
        upcoming,
        thisWeekend,
        stats: {
            total: filteredFestivals.length,
            ongoing: ongoing.length,
            upcoming: upcoming.length,
            thisWeekend: thisWeekend.length,
            regions: [...new Set(filteredFestivals.map(f => f.region))].length
        }
    };
}
