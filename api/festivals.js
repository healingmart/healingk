const axios = require('axios');

// 간단한 메모리 캐시 (5분간 유지)
let festivalCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5분

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { region = 'all', status = 'all' } = req.query;
        const now = Date.now();

        console.log('🎪 축제 API 요청:', { region, status, timestamp: new Date().toISOString() });

        // 캐시 체크 (5분 이내면 캐시된 데이터 반환)
        if (festivalCache && (now - cacheTimestamp) < CACHE_DURATION) {
            console.log('⚡ 캐시된 데이터 사용 (API 호출 절약)');
            return res.status(200).json({
                success: true,
                data: festivalCache,
                message: '🎪 캐시된 축제 정보 (5분 이내 데이터)',
                cached: true,
                cacheAge: Math.round((now - cacheTimestamp) / 1000),
                timestamp: new Date().toISOString()
            });
        }

        const apiKey = process.env.TOURISM_API_KEY;

        if (!apiKey) {
            console.log('❌ API 키 없음');
            return res.status(200).json({
                success: true,
                data: getSampleFestivalsWithStats(),
                message: '⚠️ API 키 설정 필요 - 샘플 데이터',
                timestamp: new Date().toISOString()
            });
        }

        console.log('✅ API 키 확인:', `${apiKey.substring(0, 8)}...`);

        // API 상태 먼저 체크
        const isApiHealthy = await checkApiStatus(apiKey);
        if (!isApiHealthy) {
            console.log('⚠️ API 상태 불량 - 샘플 데이터 사용');
            return res.status(200).json({
                success: true,
                data: getSampleFestivalsWithStats(),
                message: '⚠️ API 일시적 오류 - 샘플 데이터 표시',
                apiStatus: 'unhealthy',
                timestamp: new Date().toISOString()
            });
        }

        // 실제 API 호출 (더 보수적으로)
        const festivalData = await fetchFestivalData(apiKey);
        
        if (festivalData && festivalData.stats.total > 0) {
            // 성공 시 캐시 저장
            festivalCache = festivalData;
            cacheTimestamp = now;
            
            console.log('🎉 실제 축제 데이터 조회 성공:', festivalData.stats);
            
            return res.status(200).json({
                success: true,
                data: festivalData,
                message: '🎪 실시간 축제 정보',
                cached: false,
                timestamp: new Date().toISOString()
            });
        } else {
            console.log('⚠️ 실제 데이터 없음 - 샘플 데이터 사용');
            return res.status(200).json({
                success: true,
                data: getSampleFestivalsWithStats(),
                message: '⚠️ 등록된 축제 없음 - 샘플 데이터',
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('❌ 축제 API 오류:', error.message);
        return res.status(200).json({
            success: true,
            data: getSampleFestivalsWithStats(),
            message: `⚠️ 서버 오류 - 샘플 데이터: ${error.message}`,
            error: true,
            timestamp: new Date().toISOString()
        });
    }
};

// API 상태 체크 함수
async function checkApiStatus(apiKey) {
    try {
        const response = await axios.get('http://apis.data.go.kr/B551011/KorService1/searchFestival1', {
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
            timeout: 8000
        });

        const resultCode = response.data?.response?.header?.resultCode;
        const resultMsg = response.data?.response?.header?.resultMsg;
        
        console.log('🔍 API 상태:', { resultCode, resultMsg });
        
        if (resultCode === '0000') {
            return true;
        } else if (resultCode === '99') {
            console.log('⚠️ API 일일 호출 한도 초과');
            return false;
        } else if (resultCode === '01') {
            console.log('⚠️ API 서비스 키 오류');
            return false;
        } else {
            console.log('⚠️ 기타 API 오류:', resultMsg);
            return false;
        }
    } catch (error) {
        console.log('❌ API 상태 체크 실패:', error.message);
        return false;
    }
}

// 실제 축제 데이터 조회 함수 (더 간단하게)
async function fetchFestivalData(apiKey) {
    try {
        const today = new Date();
        const todayStr = formatDateRaw(today);
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 3);
        const nextMonthStr = formatDateRaw(nextMonth);

        // 주요 지역만 조회 (API 호출 최소화)
        const majorAreas = [1, 6, 39, 32, 37]; // 서울, 부산, 제주, 강원, 전북
        
        let allFestivals = [];

        for (const areaCode of majorAreas) {
            try {
                console.log(`🔍 ${getRegionName(areaCode)} 조회...`);
                
                const response = await axios.get('http://apis.data.go.kr/B551011/KorService1/searchFestival1', {
                    params: {
                        serviceKey: encodeURIComponent(apiKey),
                        numOfRows: 20, // 지역당 20개로 제한
                        pageNo: 1,
                        MobileOS: 'ETC',
                        MobileApp: 'HealingK',
                        _type: 'json',
                        listYN: 'Y',
                        arrange: 'A',
                        eventStartDate: todayStr,
                        eventEndDate: nextMonthStr,
                        areaCode: areaCode
                    },
                    timeout: 10000
                });

                if (response.data?.response?.header?.resultCode === '0000') {
                    const items = response.data.response.body?.items?.item || [];
                    const itemsArray = Array.isArray(items) ? items : (items ? [items] : []);
                    allFestivals.push(...itemsArray);
                    console.log(`✅ ${getRegionName(areaCode)}: ${itemsArray.length}개`);
                }

                // API 호출 간격 (중요!)
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.log(`❌ ${getRegionName(areaCode)} 실패:`, error.message);
                continue;
            }
        }

        console.log(`🎉 총 ${allFestivals.length}개 축제 조회`);

        if (allFestivals.length === 0) {
            return null;
        }

        // 데이터 가공
        const processedFestivals = allFestivals.map(festival => {
            const startDateRaw = festival.eventstartdate;
            const endDateRaw = festival.eventenddate;
            
            let festivalStatus = 'upcoming';
            if (startDateRaw <= todayStr && endDateRaw >= todayStr) {
                festivalStatus = 'ongoing';
            } else if (endDateRaw < todayStr) {
                festivalStatus = 'ended';
            }

            return {
                id: festival.contentid,
                title: festival.title || '축제명 없음',
                location: festival.addr1 || festival.eventplace || '장소 미정',
                region: getRegionName(parseInt(festival.areacode)),
                startDate: formatDateDisplay(startDateRaw),
                endDate: formatDateDisplay(endDateRaw),
                startDateRaw: startDateRaw,
                endDateRaw: endDateRaw,
                status: festivalStatus,
                isThisWeekend: checkThisWeekend(startDateRaw, endDateRaw, todayStr),
                tel: festival.tel || '',
                daysLeft: calculateDaysLeft(startDateRaw, endDateRaw, todayStr),
                category: festival.cat3 || festival.cat2 || '축제',
                mapx: festival.mapx,
                mapy: festival.mapy
            };
        }).filter(f => f.status !== 'ended');

        // 상태별 분류
        const ongoing = processedFestivals.filter(f => f.status === 'ongoing').slice(0, 20);
        const upcoming = processedFestivals.filter(f => f.status === 'upcoming').slice(0, 30);
        const thisWeekend = processedFestivals.filter(f => f.isThisWeekend).slice(0, 10);

        return {
            ongoing,
            upcoming,
            thisWeekend,
            stats: {
                total: processedFestivals.length,
                ongoing: ongoing.length,
                upcoming: upcoming.length,
                thisWeekend: thisWeekend.length,
                regions: [...new Set(processedFestivals.map(f => f.region))].length,
                popularRegions: getPopularRegions(processedFestivals)
            }
        };

    } catch (error) {
        console.log('❌ 축제 데이터 조회 실패:', error.message);
        return null;
    }
}

// 향상된 샘플 데이터 (더 현실적으로)
function getSampleFestivalsWithStats() {
    const today = new Date();
    const sampleFestivals = [
        {
            id: 'sample1',
            title: '2025 서울 한강축제',
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
            title: '부산 바다축제 2025',
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
            title: '제주 유채꽃 축제',
            location: '제주 성산일출봉',
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
            title: '강릉 커피축제',
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
            title: '전주 한옥마을 축제',
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
            regions: [...new Set(sampleFestivals.map(f => f.region))].length,
            popularRegions: getPopularRegions(sampleFestivals)
        }
    };
}

// 기존 헬퍼 함수들 유지 (동일)
function getRegionName(areacode) {
    const regions = {
        1: '서울', 2: '인천', 3: '대전', 4: '대구', 5: '광주', 6: '부산', 7: '울산',
        8: '세종', 31: '경기', 32: '강원', 33: '충북', 34: '충남', 35: '경북',
        36: '경남', 37: '전북', 38: '전남', 39: '제주'
    };
    return regions[areacode] || '기타';
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

function getPopularRegions(festivals) {
    const regionCount = {};
    festivals.forEach(f => {
        regionCount[f.region] = (regionCount[f.region] || 0) + 1;
    });
    
    return Object.entries(regionCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([region, count]) => ({ region, count }));
}
