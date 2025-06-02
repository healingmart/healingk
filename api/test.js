// api/test.js (최소 파라미터 버전)

// ===== DetailCommon 최소 파라미터 테스트 =====
async function testDetailSimple(apiKey, contentId, contentTypeId) {
    console.log(`🔍 DetailCommon 최소 파라미터: ID=${contentId}, TypeID=${contentTypeId || '없음'}`);
    
    // 최소한의 필수 파라미터만 사용
    const params = new URLSearchParams({
        serviceKey: apiKey,
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentId: contentId
    });
    
    // contentTypeId만 선택적으로 추가
    if (contentTypeId) {
        params.append('contentTypeId', contentTypeId);
    }

    try {
        const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?${params.toString()}`;
        console.log(`📡 최소 파라미터 URL: ${url.substring(0, 120)}...`);
        
        const response = await fetch(url, { timeout: 8000 });
        console.log(`📊 응답: ${response.status}`);
        
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }

        const responseText = await response.text();
        console.log(`📝 응답 길이: ${responseText.length}자`);
        console.log(`📝 응답 시작: ${responseText.substring(0, 200)}...`);
        
        let data;
        try {
            data = JSON.parse(responseText);
            console.log(`✅ JSON 파싱 성공`);
        } catch (parseError) {
            return { 
                success: false, 
                error: `JSON 파싱 실패: ${parseError.message}`,
                rawResponse: responseText.substring(0, 300)
            };
        }
        
        // 응답 구조 확인
        const resultCode = data.resultCode || data.response?.header?.resultCode;
        const resultMsg = data.resultMsg || data.response?.header?.resultMsg;
        
        console.log(`📊 결과: ${resultCode} - ${resultMsg}`);
        console.log(`📋 응답 구조: ${Object.keys(data).join(', ')}`);
        
        if (resultCode === '0' || resultCode === '0000') {
            console.log(`🎉 성공!`);
            
            // 데이터 위치 찾기
            let item = null;
            if (data.response?.body?.items?.item) {
                item = data.response.body.items.item;
                console.log(`📍 데이터 위치: data.response.body.items.item`);
            } else if (data.items?.item) {
                item = data.items.item;
                console.log(`📍 데이터 위치: data.items.item`);
            } else if (data.item) {
                item = data.item;
                console.log(`📍 데이터 위치: data.item`);
            } else {
                console.log(`📍 데이터 위치를 찾을 수 없음`);
                return {
                    success: true,
                    noData: true,
                    responseStructure: Object.keys(data),
                    fullResponse: data
                };
            }
            
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                console.log(`📋 Item 키들: ${Object.keys(itemData).join(', ')}`);
                
                return {
                    success: true,
                    contentTypeId: contentTypeId || 'none',
                    dataFound: true,
                    itemKeys: Object.keys(itemData),
                    detailInfo: {
                        hasOverview: !!itemData.overview,
                        overviewLength: itemData.overview?.length || 0,
                        hasTel: !!itemData.tel,
                        hasHomepage: !!itemData.homepage,
                        hasUseTime: !!itemData.usetime,
                        hasParking: !!itemData.parking
                    },
                    sampleData: {
                        overview: itemData.overview?.substring(0, 100) || null,
                        tel: itemData.tel || null,
                        homepage: itemData.homepage || null,
                        usetime: itemData.usetime || null
                    }
                };
            }
        } else {
            return { 
                success: false, 
                error: `API 오류: ${resultCode} - ${resultMsg}`,
                contentTypeId: contentTypeId || 'none',
                responseStructure: Object.keys(data)
            };
        }

    } catch (error) {
        return { 
            success: false, 
            error: error.message,
            contentTypeId: contentTypeId || 'none'
        };
    }
}

// ... (나머지 코드는 동일)
