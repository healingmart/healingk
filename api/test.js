// api/test.js (디버깅 강화 버전)

// ===== DetailCommon API 호출 (완전 디버깅 버전) =====
async function fetchDetailCommon(apiKey, contentId, contentTypeId) {
    console.log(`\n🔍 === DetailCommon API 디버깅 시작 ===`);
    console.log(`  ContentID: ${contentId}`);
    console.log(`  ContentTypeID: ${contentTypeId}`);
    
    // 1. 다양한 파라미터 조합 시도
    const parameterSets = [
        // 세트 1: 기본 파라미터
        {
            name: '기본_파라미터',
            params: {
                serviceKey: apiKey,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                contentId: contentId,
                contentTypeId: contentTypeId.toString(),
                defaultYN: 'Y',
                overviewYN: 'Y'
            }
        },
        // 세트 2: 모든 YN 파라미터 추가
        {
            name: '전체_파라미터',
            params: {
                serviceKey: apiKey,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                contentId: contentId,
                contentTypeId: contentTypeId.toString(),
                defaultYN: 'Y',
                firstImageYN: 'Y',
                areacodeYN: 'Y',
                catcodeYN: 'Y',
                addrinfoYN: 'Y',
                mapinfoYN: 'Y',
                overviewYN: 'Y'
            }
        },
        // 세트 3: Service1 시도
        {
            name: 'Service1_백업',
            params: {
                serviceKey: apiKey,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                contentId: contentId,
                contentTypeId: contentTypeId.toString(),
                defaultYN: 'Y',
                overviewYN: 'Y'
            },
            useService1: true
        }
    ];

    // 각 파라미터 세트로 시도
    for (const paramSet of parameterSets) {
        console.log(`\n📋 [${paramSet.name}] 시도 중...`);
        
        const baseUrl = paramSet.useService1 
            ? 'https://apis.data.go.kr/B551011/KorService1/detailCommon1'
            : 'https://apis.data.go.kr/B551011/KorService2/detailCommon2';
            
        const params = new URLSearchParams(paramSet.params);
        const fullUrl = `${baseUrl}?${params.toString()}`;
        
        console.log(`📡 URL: ${fullUrl}`);
        console.log(`📋 파라미터:`, paramSet.params);

        try {
            const response = await fetchWithTimeout(fullUrl, 15000);
            console.log(`📊 응답: ${response.status} ${response.statusText}`);
            console.log(`📦 Content-Type: ${response.headers.get('content-type')}`);
            
            if (!response.ok) {
                console.log(`❌ HTTP 오류: ${response.status}`);
                continue;
            }

            const responseText = await response.text();
            console.log(`📝 원본 응답 길이: ${responseText.length}자`);
            console.log(`📝 응답 시작: ${responseText.substring(0, 200)}...`);
            
            // JSON 파싱 시도
            let data;
            try {
                data = JSON.parse(responseText);
                console.log(`✅ JSON 파싱 성공`);
            } catch (parseError) {
                console.log(`❌ JSON 파싱 실패: ${parseError.message}`);
                console.log(`📄 전체 응답: ${responseText}`);
                continue;
            }
            
            console.log(`📦 파싱된 구조:`, {
                hasResponse: !!data.response,
                hasHeader: !!data.response?.header,
                hasBody: !!data.response?.body,
                hasItems: !!data.response?.body?.items,
                hasItem: !!data.response?.body?.items?.item
            });
            
            // 결과 코드 확인
            const resultCode = data.response?.header?.resultCode;
            const resultMsg = data.response?.header?.resultMsg;
            console.log(`📊 결과: ${resultCode} - ${resultMsg}`);
            
            if (resultCode === '0000') {
                const item = data.response.body?.items?.item;
                console.log(`📋 Item 존재: ${!!item}`);
                
                if (item) {
                    const itemData = Array.isArray(item) ? item[0] : item;
                    console.log(`📋 Item 데이터 키들:`, Object.keys(itemData));
                    console.log(`📋 Overview 길이: ${itemData.overview?.length || 0}자`);
                    console.log(`📋 Tel: ${itemData.tel || '없음'}`);
                    console.log(`📋 Homepage: ${itemData.homepage || '없음'}`);
                    console.log(`📋 UseTime: ${itemData.usetime || '없음'}`);
                    console.log(`📋 Parking: ${itemData.parking || '없음'}`);
                    
                    // 성공한 경우 결과 반환
                    const result = {
                        overview: itemData.overview || null,
                        tel: itemData.tel || null,
                        homepage: itemData.homepage || null,
                        useTime: itemData.usetime || null,
                        restDate: itemData.restdate || null,
                        useFee: itemData.usefee || null,
                        parking: itemData.parking || null,
                        babyCarriage: itemData.babycarriage || null,
                        pet: itemData.pet || null,
                        disabled: itemData.disabled || null,
                        successMethod: paramSet.name
                    };
                    
                    console.log(`🎉 [${paramSet.name}] 성공!`);
                    return result;
                } else {
                    console.log(`⚠️ [${paramSet.name}] Item이 null`);
                }
            } else {
                console.log(`❌ [${paramSet.name}] API 오류: ${resultCode} - ${resultMsg}`);
            }
            
        } catch (error) {
            console.log(`❌ [${paramSet.name}] 요청 실패: ${error.message}`);
        }
        
        // 다음 시도 전 딜레이
        await sleep(1000);
    }
    
    console.log(`❌ === DetailCommon API 모든 시도 실패 ===\n`);
    return null;
}

// ===== 메인 핸들러 수정 (로깅 강화) =====
async function getDetailedAttractionInfo(apiKey, basicAttraction, detailLevel) {
    const contentId = basicAttraction.id;
    
    console.log(`\n🏨 ===== ${basicAttraction.title} 상세 정보 수집 =====`);
    console.log(`📋 기본 정보:`);
    console.log(`  ID: ${contentId}`);
    console.log(`  제목: ${basicAttraction.title}`);
    console.log(`  카테고리: ${basicAttraction.category}`);
    console.log(`  주소: ${basicAttraction.address}`);
    console.log(`  기존 전화: ${basicAttraction.tel}`);
    
    // ContentTypeId 결정 로직 상세화
    let contentTypeId = 32; // 숙박 기본값
    
    console.log(`🔍 ContentTypeId 결정:`);
    console.log(`  카테고리: ${basicAttraction.category}`);
    console.log(`  최종 ContentTypeId: ${contentTypeId} (숙박시설)`);
    
    try {
        // DetailCommon API 호출 (상세 디버깅)
        console.log(`\n📋 === DetailCommon API 호출 시작 ===`);
        const commonDetail = await fetchDetailCommon(apiKey, contentId, contentTypeId);
        
        if (commonDetail) {
            console.log(`✅ DetailCommon 성공! (방법: ${commonDetail.successMethod})`);
            console.log(`📋 수집된 정보:`);
            console.log(`  - 개요: ${commonDetail.overview ? `${commonDetail.overview.substring(0, 50)}...` : '없음'}`);
            console.log(`  - 전화: ${commonDetail.tel || '없음'}`);
            console.log(`  - 홈페이지: ${commonDetail.homepage || '없음'}`);
            console.log(`  - 이용시간: ${commonDetail.useTime || '없음'}`);
            console.log(`  - 주차: ${commonDetail.parking || '없음'}`);
        } else {
            console.log(`❌ DetailCommon 완전 실패`);
        }
        
        // DetailIntro는 기존과 동일하게 계속 진행
        let introDetail = null;
        if (detailLevel === 'full') {
            console.log(`\n🏷️ === DetailIntro API 호출 시작 ===`);
            introDetail = await fetchDetailIntro(apiKey, contentId, contentTypeId);
            if (introDetail) {
                console.log(`✅ DetailIntro 성공!`);
            } else {
                console.log(`❌ DetailIntro 실패`);
            }
        }
        
        // 결과 통합
        const enrichedAttraction = {
            ...basicAttraction,
            
            // DetailCommon 정보 (있으면 적용)
            overview: commonDetail?.overview || basicAttraction.overview,
            tel: commonDetail?.tel || basicAttraction.tel,
            homepage: commonDetail?.homepage || null,
            
            // 확장된 이용 정보
            useInfo: {
                useTime: commonDetail?.useTime || null,
                restDate: commonDetail?.restDate || null,
                useFee: commonDetail?.useFee || null,
                parking: commonDetail?.parking || null,
                babyCarriage: commonDetail?.babyCarriage || null,
                pet: commonDetail?.pet || null,
                disabled: commonDetail?.disabled || null
            },
            
            // 좌표 정보 통합
            coordinates: {
                x: parseFloat(basicAttraction.mapx) || null,
                y: parseFloat(basicAttraction.mapy) || null,
                address: basicAttraction.address
            },
            
            // 이미지 정보 확장
            images: {
                main: basicAttraction.image,
                thumbnail: null,
                additional: []
            },
            
            // 특화 정보
            detailedInfo: introDetail || null,
            
            // 데이터 품질 (개선된 계산)
            dataQuality: {
                hasOverview: !!commonDetail?.overview,
                hasUseInfo: !!(commonDetail?.useTime || commonDetail?.useFee),
                hasDetailedInfo: !!introDetail,
                hasAdditionalImages: false,
                completeness: calculateCompleteness(commonDetail, introDetail, []),
                detailCommonSuccess: !!commonDetail,
                detailIntroSuccess: !!introDetail,
                successMethod: commonDetail?.successMethod || null
            },
            
            lastUpdated: new Date().toISOString()
        };
        
        const finalCompleteness = enrichedAttraction.dataQuality.completeness;
        console.log(`\n📊 === 최종 결과 ===`);
        console.log(`✅ ${basicAttraction.title} 처리 완료`);
        console.log(`📈 완성도: ${finalCompleteness}%`);
        console.log(`🔍 DetailCommon: ${commonDetail ? '성공' : '실패'}`);
        console.log(`🏷️ DetailIntro: ${introDetail ? '성공' : '실패'}`);
        console.log(`==============================\n`);
        
        return enrichedAttraction;
        
    } catch (error) {
        console.error(`❌ ${basicAttraction.title} 전체 실패:`, error.message);
        return {
            ...basicAttraction,
            dataQuality: {
                hasOverview: false,
                hasUseInfo: false,
                hasDetailedInfo: false,
                hasAdditionalImages: false,
                completeness: 20,
                error: error.message
            }
        };
    }
}

// ... (나머지 함수들은 기존과 동일)
