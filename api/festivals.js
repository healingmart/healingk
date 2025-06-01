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
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));

        if (!apiKey) {
            console.log('❌ API 키 없음 - 샘플 데이터 반환');
            return res.status(200).json({
                success: true,
                data: getSampleFestivalsWithStats('all'),
                message: '⚠️ API 키 설정 필요 - 샘플 데이터',
                timestamp: new Date().toISOString()
            });
        }

        console.log('✅ API 키 확인 완료:', `${apiKey.substring(0, 10)}...`);

        // 날짜 범위를 더 넓게 설정 (6개월 전부터 6개월 후까지)
        const today = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const sixMonthsLater = new Date();
        sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

        const startDate = formatDateRaw(sixMonthsAgo);
        const endDate = formatDateRaw(sixMonthsLater);
        const todayStr = formatDateRaw(today);

        console.log('📅 검색 날짜 범위:', { startDate, endDate, todayStr });

        // 지역 코드 확장 (모든 지역 포함)
        const areaCodesToFetch = region !== 'all' ? [getAreaCode(region)] : 
            [1, 2, 3, 4, 5, 6, 7, 8, 31, 32, 33, 34, 35, 36, 37, 38, 39];

        console.log('🗺️ 조회할 지역 코드:', areaCodesToFetch);

        let allFestivals = [];

        // 각 지역별로 순차 조회 (병렬 조회 시 API 제한 때문에 문제가 될 수 있음)
        for (const areaCode of areaCodesToFetch) {
            try {
                console.log(`🔍 지역 ${areaCode} (${getRegionName(areaCode)}) 조회 시작...`);

                const encodedApiKey = encodeURIComponent(apiKey);
                
                // 기본 축제 정보 조회 (파라미터 수정)
                const response = await axios.get('http://apis.data.go.kr/B551011/KorService1/searchFestival1', {
                    params: {
                        serviceKey: encodedApiKey,
                        numOfRows: 50,
                        pageNo: 1,
                        MobileOS: 'ETC',
                        MobileApp: 'HealingK',
                        _type: 'json',
                        listYN: 'Y',
                        arrange: 'A', // 정렬 기준
                        eventStartDate: startDate, // 더 넓은 범위
                        eventEndDate: endDate,     // 더 넓은 범위
                        areaCode: areaCode
                    },
                    timeout: 15000
                });

                console.log(`📊 지역 ${areaCode} API 응답:`, {
                    status: response.status,
                    resultCode: response.data?.response?.header?.resultCode,
                    resultMsg: response.data?.response?.header?.resultMsg
                });

                if (response.data?.response?.header?.resultCode === '0000') {
                    const items = response.data.response.body?.items?.item || [];
                    const itemsArray = Array.isArray(items) ? items : (items ? [items] : []);
                    
                    console.log(`✅ 지역 ${areaCode} 축제 ${itemsArray.length}개 발견`);

                    // 간단한 로깅으로 어떤 축제들이 있는지 확인
                    if (itemsArray.length > 0) {
                        console.log(`📝 지역 ${areaCode} 축제 목록:`);
                        itemsArray.slice(0, 3).forEach((fest, idx) => {
                            console.log(`  ${idx + 1}. ${fest.title} (${fest.eventstartdate}~${fest.eventenddate})`);
                        });
                    }

                    allFestivals.push(...itemsArray);
                } else {
                    console.log(`❌ 지역 ${areaCode} 오류:`, response.data?.response?.header?.resultMsg);
                }

                // API 호출 간격 (너무 빠르면 제한될 수 있음)
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.log(`❌ 지역 ${areaCode} 요청 실패:`, error.message);
                continue;
            }
        }

        console.log(`🎉 총 조회된 축제 수: ${allFestivals.length}`);

        if (allFestivals.length === 0) {
            console.log('⚠️ 실제 데이터 없음 - 샘플 데이터로 대체');
            return res.status(200).json({
                success: true,
                data: getSampleFestivalsWithStats('all'),
                message: '⚠️ 현재 등록된 축제가 없습니다 - 샘플 데이터 표시',
                timestamp: new Date().toISOString(),
                debug: {
                    searchRange: { startDate, endDate },
                    regionsSearched: areaCodesToFetch.length,
                    totalApiCalls: areaCodesToFetch.length
                }
            });
        }

        // 축제 데이터 가공
        const processedFestivals = allFestivals.map(festival => {
            const startDateRaw = festival.eventstartdate;
            const endDateRaw = festival.eventenddate;
            
            let festivalStatus = 'upcoming';
            if (startDateRaw <= todayStr && endDateRaw >= todayStr) {
                festivalStatus = 'ongoing';
            } else if (endDateRaw < todayStr) {
                festivalStatus = 'ended';
            }

            // 이번 주말 여부 체크
            const isThisWeekend = checkThisWeekend(startDateRaw, endDateRaw, todayStr);

            return {
                id: festival.contentid,
                title: festival.title || '축제명 없음',
                location: festival.addr1 || festival.eventplace || '장소 미정',
                detailLocation: festival.addr2 || '',
                region: getRegionName(parseInt(festival.areacode)),
                startDate: formatDateDisplay(startDateRaw),
                endDate: formatDateDisplay(endDateRaw),
                startDateRaw: startDateRaw,
                endDateRaw: endDateRaw,
                status: festivalStatus,
                isThisWeekend: isThisWeekend,
                tel: festival.tel || '',
                homepage: cleanHomepage(festival.homepage || ''),
                overview: cleanOverview(festival.overview || ''),
                image: festival.firstimage || festival.firstimage2 || null,
                mapx: festival.mapx,
                mapy: festival.mapy,
                daysLeft: calculateDaysLeft(startDateRaw, endDateRaw, todayStr),
                category: festival.cat3 || festival.cat2 || '축제',
                zipcode: festival.zipcode || '',
                mlevel: festival.mlevel || ''
            };
        });

        // 상태별 분류
        const ongoing = processedFestivals
            .filter(f => f.status === 'ongoing')
            .sort((a, b) => a.endDateRaw.localeCompare(b.endDateRaw))
            .slice(0, 50);

        const upcoming = processedFestivals
            .filter(f => f.status === 'upcoming')
            .sort((a, b) => a.startDateRaw.localeCompare(b.startDateRaw))
            .slice(0, 50);

        const thisWeekend = processedFestivals
            .filter(f => f.isThisWeekend)
            .slice(0, 30);

        // 통계
        const stats = {
            total: processedFestivals.length,
            ongoing: ongoing.length,
            upcoming: upcoming.length,
            thisWeekend: thisWeekend.length,
            ended: processedFestivals.filter(f => f.status === 'ended').length,
            regions: [...new Set(processedFestivals.map(f => f.region))].length,
            popularRegions: getPopularRegions(processedFestivals)
        };

        console.log('📊 최종 통계:', stats);

        return res.status(200).json({
            success: true,
            data: {
                ongoing,
                upcoming,
                thisWeekend,
                stats,
                message: '🎪 실시간 축제 정보 조회 성공!',
                lastUpdate: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 축제 정보 조회 중 오류:', error);
        return res.status(200).json({
            success: false,
            data: getSampleFestivalsWithStats('all'),
            message: `⚠️ 데이터 조회 오류: ${error.message}`,
            timestamp: new Date().toISOString(),
            error: true
        });
    }
};

// HTML 태그 제거 함수들
function cleanHomepage(homepage) {
    if (!homepage) return '';
    return homepage.replace(/<[^>]*>/g, '').trim();
}

function cleanOverview(overview) {
    if (!overview) return '';
    return overview.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').trim();
}

// 이번 주말 체크 함수
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

// 기존 헬퍼 함수들 유지
function getAreaCode(regionName) {
    const codes = {
        '서울': 1, '인천': 2, '대전': 3, '대구': 4, '광주': 5, '부산': 6, '울산': 7,
        '세종': 8, '경기': 31, '강원': 32, '충북': 33, '충남': 34, '경북': 35,
        '경남': 36, '전북': 37, '전남': 38, '제주': 39
    };
    return codes[regionName] || null;
}

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
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    return `${year}.${month}.${day}`;
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

function getSampleFestivalsWithStats(type) {
    const sampleFestivals = [
        {
            id: '1',
            title: '서울 빛초롱 축제 2025',
            location: '청계천 일대',
            detailLocation: '청계광장~청계8가',
            region: '서울',
            startDate: '2025.05.01',
            endDate: '2025.06.15',
            status: 'ongoing',
            isThisWeekend: true,
            tel: '02-2290-7111',
            homepage: 'https://www.seoul.go.kr',
            overview: '서울의 대표적인 빛축제로 아름다운 등불이 청계천을 수놓습니다.',
            category: '문화축제',
            daysLeft: '14일 남음',
            mapx: '126.9784147',
            mapy: '37.5666805'
        },
        {
            id: '2',
            title: '부산 바다축제 2025',
            location: '해운대 해수욕장',
            region: '부산',
            startDate: '2025.06.10',
            endDate: '2025.06.20',
            status: 'upcoming',
            isThisWeekend: false,
            tel: '051-749-4000',
            category: '해양축제',
            daysLeft: '9일 후 시작'
        },
        {
            id: '3',
            title: '제주 유채꽃 축제',
            location: '제주 서귀포시',
            region: '제주',
            startDate: '2025.06.05',
            endDate: '2025.06.12',
            status: 'upcoming',
            isThisWeekend: true,
            category: '자연축제',
            daysLeft: '4일 후 시작'
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
