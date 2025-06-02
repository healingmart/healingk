// api/test.js (DetailCommon 응답 구조 분석 버전)

// ===== DetailCommon 상세 분석 =====
async function testDetailCommon(apiKey, contentId) {
    console.log(`🔍 DetailCommon 상세 분석: ID=${contentId}`);
    
    const params = new URLSearchParams({
        serviceKey: apiKey,
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentId: contentId,
        contentTypeId: '32',  // 숙박시설
        defaultYN: 'Y',
        overviewYN: 'Y'
    });

    try {
        const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?${params.toString()}`;
        console.log(`📡 DetailCommon URL: ${url.substring(0, 120)}...`);
        
        const response = await fetch(url, { timeout: 10000 });
        console.log(`📊 DetailCommon 응답: ${response.status} ${response.statusText}`);
        console.log(`📦 Content-Type: ${response.headers.get('content-type')}`);
        
        if (!response.ok) {
            return { 
                success: false, 
                error: `HTTP ${response.status}: ${response.statusText}`,
                step: 'fetch_failed'
            };
        }

        // 원본 텍스트 먼저 확인
        const responseText = await response.text();
        console.log(`📝 응답 길이: ${responseText.length}자`);
        console.log(`📝 응답 시작: ${responseText.substring(0, 300)}...`);
        
        // JSON 파싱 시도
        let data;
        try {
            data = JSON.parse(responseText);
            console.log(`✅ JSON 파싱 성공`);
        } catch (parseError) {
            return {
                success: false,
                error: `JSON 파싱 실패: ${parseError.message}`,
                step: 'json_parse_failed',
                rawResponse: responseText.substring(0, 500)
            };
        }
        
        // 응답 구조 상세 분석
        const analysis = {
            hasResponse: !!data.response,
            hasHeader: !!data.response?.header,
            hasBody: !!data.response?.body,
            hasItems: !!data.response?.body?.items,
            hasItem: !!data.response?.body?.items?.item,
            
            // 결과 코드들
            resultCode: data.response?.header?.resultCode,
            resultMsg: data.response?.header?.resultMsg,
            
            // 전체 구조
            responseKeys: Object.keys(data),
            headerKeys: data.response?.header ? Object.keys(data.response.header) : [],
            bodyKeys: data.response?.body ? Object.keys(data.response.body) : []
        };
        
        console.log(`📋 응답 구조 분석:`, analysis);
        
        // 실제 데이터 확인
        if (data.response?.header?.resultCode === '0000') {
            const item = data.response.body?.items?.item;
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                const itemKeys = Object.keys(itemData);
                console.log(`📋 Item 키들: ${itemKeys.join(', ')}`);
                
                return {
                    success: true,
                    analysis: analysis,
                    itemKeys: itemKeys,
                    sampleData: {
                        overview: itemData.overview?.substring(0, 100) || null,
                        tel: itemData.tel || null,
                        homepage: itemData.homepage || null,
                        usetime: itemData.usetime || null,
                        parking: itemData.parking || null
                    }
                };
            } else {
                return {
                    success: false,
                    error: 'Item이 null 또는 undefined',
                    analysis: analysis
                };
            }
        } else {
            return {
                success: false,
                error: `API 결과 코드: ${data.response?.header?.resultCode || 'undefined'}`,
                errorMsg: data.response?.header?.resultMsg || 'undefined',
                analysis: analysis,
                fullResponse: data  // 전체 응답 포함
            };
        }

    } catch (error) {
        return {
            success: false,
            error: error.message,
            step: 'request_failed'
        };
    }
}

// 메인 핸들러는 기존과 동일하되, detailTest 결과를 더 상세히 반환
module.exports = async function handler(req, res) {
    // ... (기존과 동일)
    
    try {
        // ... (기본 데이터 수집 부분 동일)
        
        // DetailCommon 테스트 부분만 수정
        if (detail === 'test' && testAttraction) {
            console.log(`🔍 ${testAttraction.title} 상세 분석 시작`);
            
            const detailResult = await testDetailCommon(apiKey, testAttraction.id);
            testAttraction.detailAnalysis = detailResult;
            
            console.log(`📋 DetailCommon 분석 완료`);
            console.log(`📊 성공 여부: ${detailResult.success}`);
            if (!detailResult.success) {
                console.log(`❌ 실패 원인: ${detailResult.error}`);
                console.log(`🔍 실패 단계: ${detailResult.step || '알 수 없음'}`);
            }
        }
        
        // ... (나머지 응답 부분 동일)
        
    } catch (error) {
        // ... (에러 처리 동일)
    }
};
// ===== API 키 확인 =====
function getAPIKey() {
    const keys = [
        process.env.TOURISM_API_KEY,
        process.env.TOUR_API_KEY,
        process.env.JEONBUK_API_KEY,
        process.env.WEATHER_API_KEY,
        process.env.REGIONAL_API_KEY
    ];
    
    return keys.find(key => key && key.length > 10);
}
